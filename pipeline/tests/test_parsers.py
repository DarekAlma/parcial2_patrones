"""Pruebas de los parsers con fragmentos reales (recortados) de cada fuente.

    cd pipeline && python -m pytest -q        (o: python -m unittest discover tests)
"""
import unittest
from datetime import date

from wandersync.config import TripWindow, build_windows
from wandersync.scrapers import google_flights, google_hotels, kayak_cars
from wandersync.scrapers.base import parse_duration_minutes, parse_money, stable_id
from wandersync.transform import clean_cars, clean_flights, clean_hotels

WINDOW = TripWindow("BOG", "ADZ", "San Andrés", date(2026, 10, 30), date(2026, 11, 2))

FLIGHT_HTML = """
<ul><li><div aria-label="A partir de 865300 pesos colombianos (precio total de ida y vuelta).El acceso al
compartimento superior no está incluido en el precio. Vuelo directo de JetSMART. Operado por Jetsmart Airlines
S.a.s.. Sale de Aeropuerto Internacional El Dorado el viernes, octubre 30 a las 18:20. Llega a Aeropuerto
Internacional Gustavo Rojas Pinilla - San Andrés el viernes, octubre 30 a las 20:44. Duración total: 2 h 24 min.
Seleccionar vuelo"></div></li>
<li><div aria-label="A partir de 1047900 pesos colombianos (precio total de ida y vuelta). Vuelo con 1 escala de
Avianca. Sale de Aeropuerto Internacional El Dorado el viernes, octubre 30 a las 5:45. Llega a Aeropuerto
Internacional Gustavo Rojas Pinilla - San Andrés el viernes, octubre 30 a las 9:55. Duración total: 4 h 10 min.
Seleccionar vuelo"></div></li>
<li><div aria-label="Detalles del vuelo. Sale de Aeropuerto Internacional El Dorado"></div></li></ul>
""".replace("\n", " ")

HOTEL_HTML = """
<div class="uaTTDe"><a href="/travel/hotels/entity/abc"><img src="https://lh3.googleusercontent.com/x.jpg"></a>
<h2>Hotel Casa Santafé</h2><span>OFERTA</span><span>COP 90,000</span><span>COP 270,000 en total</span>
<span>3 noches con impuestos y tasas</span><span>24% menos de lo habitual</span><span>4.7</span><span>(186)</span>
<span>Hotel de 3 estrellas</span><span>Servicios que ofrece Hotel Casa Santafé: Wi-Fi gratuito, Desayuno</span></div>
<div class="uaTTDe"><h2>Hotel Casa Santafé</h2><span>COP 90,000</span></div>
"""

CAR_HTML = """
<div class="js-result jo6g-car-result-item" data-result-id="1"><div class="MseY-title js-title">Nissan March</div>
<div class="MseY-sub-title">o Económico similar</div>
<div aria-label="N.º de pasajeros">5</div><div aria-label="N.º de maletas">1</div>
<div aria-label="N.º de puertas">5</div><div aria-label="Tipo de transmisión">M</div>
<div class="NYO--address" aria-label="CTG: Cartagena de Indias Internacional Rafael Núñez, Se puede"></div>
<div aria-label="This Excelente oferta from EconomyBookings has a score of 9,4"></div>
<div class="EuxN-provider-name">EconomyBookings</div><div aria-label="Total: $482.719">$482.719</div>
<img src="https://content.r9cdn.net/car.png"></div>
"""


class HelpersTest(unittest.TestCase):
    def test_parse_money(self):
        self.assertEqual(parse_money("COP 102,229"), 102229)
        self.assertEqual(parse_money("$ 196.191"), 196191)
        self.assertIsNone(parse_money(None))

    def test_duration(self):
        self.assertEqual(parse_duration_minutes("1 h 32 min"), 92)
        self.assertEqual(parse_duration_minutes("2 h"), 120)
        self.assertEqual(parse_duration_minutes("55 min"), 55)

    def test_stable_id_is_deterministic(self):
        self.assertEqual(stable_id("a", 1), stable_id("a", 1))
        self.assertNotEqual(stable_id("a", 1), stable_id("a", 2))

    def test_windows_share_search_key(self):
        windows = build_windows("BOG", ["CTG", "MDE"], 30, 3, today=date(2026, 9, 27))
        self.assertEqual(windows[0].search_key, "BOG-CTG-2026-10-27-2026-10-30")
        self.assertEqual(windows[1].nights, 3)


class FlightsParserTest(unittest.TestCase):
    def test_parse(self):
        rows = google_flights.parse_html(FLIGHT_HTML)
        self.assertEqual(len(rows), 2)
        direct, one_stop = rows
        self.assertEqual(direct["price_cop"], 865300)
        self.assertEqual(direct["airline"], "JetSMART")
        self.assertEqual(direct["operated_by"], "Jetsmart Airlines S.a.s.")
        self.assertEqual(direct["depart_time"], "18:20")
        self.assertEqual(direct["duration_minutes"], 144)
        self.assertEqual(one_stop["stops"], 1)
        self.assertEqual(one_stop["airline"], "Avianca")

    def test_clean_adds_window(self):
        clean = clean_flights(google_flights.parse_html(FLIGHT_HTML), WINDOW, "run-1", 10)
        self.assertEqual(clean[0]["search_key"], WINDOW.search_key)
        self.assertEqual(clean[0]["return_date"], "2026-11-02")


class HotelsParserTest(unittest.TestCase):
    def test_query_crosses_month(self):
        self.assertIn("del 30 de octubre al 2 de noviembre de 2026", google_hotels.build_query(WINDOW))

    def test_parse_and_dedupe(self):
        raw = google_hotels.parse_html(HOTEL_HTML, 3)
        self.assertEqual(raw[0]["price_per_night_cop"], 90000)
        self.assertEqual(raw[0]["total_price_cop"], 270000)
        self.assertEqual(raw[0]["rating"], 4.7)
        self.assertEqual(raw[0]["reviews"], 186)
        self.assertEqual(raw[0]["stars"], 3)
        clean = clean_hotels(raw, WINDOW, "run-1", 10)
        self.assertEqual(len(clean), 1)  # duplicado eliminado


class CarsParserTest(unittest.TestCase):
    def test_parse(self):
        rows = kayak_cars.parse_html(CAR_HTML)
        self.assertEqual(len(rows), 1)
        car = rows[0]
        self.assertEqual(car["model"], "Nissan March")
        self.assertEqual(car["category"], "Económico")
        self.assertEqual(car["provider"], "EconomyBookings")
        self.assertEqual(car["total_price_cop"], 482719)
        self.assertEqual(car["transmission"], "Manual")
        self.assertEqual(car["score"], 9.4)
        clean = clean_cars(rows, WINDOW, "run-1", 10)
        self.assertEqual(clean[0]["days"], 3)


if __name__ == "__main__":
    unittest.main()
