import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '../App';
import { duration, errorMessage, money, shortDate, timeAgo } from '../format';
import { BOOK_PACKAGE, DESTINATIONS, MY_ORDERS, PACKAGE_SEARCH } from '../graphql';

type TripWindow = {
  searchKey: string;
  origin: string;
  destination: string;
  destinationName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  flightOffers: number;
  hotelOffers: number;
  carOffers: number;
  minFlightPriceCop: number | null;
  minHotelPriceCop: number | null;
  minCarPriceCop: number | null;
  scrapedAt: string | null;
};
type Flight = { id: string; airline: string; stops: number; departTime: string; arriveTime: string; durationMinutes: number; priceCop: number; seatsAvailable: number };
type Hotel = { id: string; name: string; pricePerNightCop: number; totalPriceCop: number; nights: number; rating: number | null; reviews: number | null; stars: number | null; deal: string | null; imageUrl: string | null; roomsAvailable: number };
type Car = { id: string; model: string; category: string | null; provider: string | null; totalPriceCop: number; passengers: number | null; transmission: string | null; imageUrl: string | null; unitsAvailable: number };

const FAILURES = [
  { value: 'NONE', label: 'Sin fallo (happy path)' },
  { value: 'FLIGHT', label: 'Falla el servicio de Vuelos' },
  { value: 'HOTEL', label: 'Falla el servicio de Hoteles' },
  { value: 'CAR', label: 'Falla el servicio de Autos' },
  { value: 'PAYMENT', label: 'Pago rechazado' },
];

type Props = { user: User | null; onNeedAuth: () => void; onBooked: (orderId: string) => void };

export function PackagesPage({ user, onNeedAuth, onBooked }: Props) {
  const destinations = useQuery<{ destinations: TripWindow[] }>(DESTINATIONS);
  const windows = destinations.data?.destinations ?? [];
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const active = windows.find((w) => w.searchKey === searchKey) ?? null;

  useEffect(() => {
    if (!searchKey && windows.length) setSearchKey(windows[0].searchKey);
  }, [windows, searchKey]);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Arma tu paquete turístico</h1>
          <p>
            Precios reales extraídos de <b>Google Flights</b>, <b>Google Hotels</b> y <b>Kayak</b> por workers de Dask,
            orquestados con Prefect y servidos por un único API GraphQL.
          </p>
        </div>
      </section>

      {destinations.loading && !windows.length && <p className="muted">Cargando destinos…</p>}
      {destinations.error && <p className="error">{errorMessage(destinations.error)}</p>}
      {!destinations.loading && !windows.length && !destinations.error && (
        <div className="empty">
          Aún no hay catálogo. La primera ingesta se ejecuta al arrancar; revisa la pestaña <b>Ingesta de datos</b>.
        </div>
      )}

      <div className="destinations">
        {windows.map((w) => (
          <button
            key={w.searchKey}
            className={w.searchKey === searchKey ? 'destination selected' : 'destination'}
            onClick={() => setSearchKey(w.searchKey)}
          >
            <span className="dest-code">{w.destination}</span>
            <strong>{w.destinationName}</strong>
            <span className="muted">
              {shortDate(w.checkIn)} → {shortDate(w.checkOut)} · {w.nights} noches
            </span>
            <span className="dest-price">desde {money((w.minFlightPriceCop ?? 0) + (w.minHotelPriceCop ?? 0) + (w.minCarPriceCop ?? 0))}</span>
            <span className="muted tiny">
              {w.flightOffers} vuelos · {w.hotelOffers} hoteles · {w.carOffers} autos · {timeAgo(w.scrapedAt)}
            </span>
          </button>
        ))}
      </div>

      {active && <PackageBuilder key={active.searchKey} window={active} user={user} onNeedAuth={onNeedAuth} onBooked={onBooked} />}
    </div>
  );
}

function PackageBuilder({ window: w, user, onNeedAuth, onBooked }: { window: TripWindow } & Props) {
  const { data, loading, error } = useQuery<{ packageSearch: { flights: Flight[]; hotels: Hotel[]; cars: Car[] } }>(
    PACKAGE_SEARCH,
    { variables: { searchKey: w.searchKey } },
  );
  const [flightId, setFlightId] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [carId, setCarId] = useState<string | null>(null);
  const [travelers, setTravelers] = useState(1);
  const [failure, setFailure] = useState('NONE');
  const [book, booking] = useMutation<{ bookPackage: { id: string } }>(BOOK_PACKAGE, {
    refetchQueries: [{ query: MY_ORDERS }],
  });

  const flights = data?.packageSearch.flights ?? [];
  const hotels = data?.packageSearch.hotels ?? [];
  const cars = data?.packageSearch.cars ?? [];

  // Preselecciona lo más económico.
  useEffect(() => {
    if (!flightId && flights[0]) setFlightId(flights[0].id);
    if (!hotelId && hotels[0]) setHotelId(hotels[0].id);
    if (!carId && cars[0]) setCarId(cars[0].id);
  }, [flights, hotels, cars, flightId, hotelId, carId]);

  const flight = flights.find((f) => f.id === flightId);
  const hotel = hotels.find((h) => h.id === hotelId);
  const car = cars.find((c) => c.id === carId);
  const total = useMemo(
    () => (flight ? flight.priceCop * travelers : 0) + (hotel?.totalPriceCop ?? 0) + (car?.totalPriceCop ?? 0),
    [flight, hotel, car, travelers],
  );

  async function reserve() {
    if (!user) return onNeedAuth();
    if (!flight || !hotel || !car) return;
    try {
      const result = await book({
        variables: {
          input: { flightOfferId: flight.id, hotelOfferId: hotel.id, carOfferId: car.id, travelers, simulateFailure: failure },
        },
      });
      if (result.data) onBooked(result.data.bookPackage.id);
    } catch {
      /* se muestra con booking.error */
    }
  }

  if (loading && !data) return <p className="muted">Consultando disponibilidad…</p>;
  if (error) return <p className="error">{errorMessage(error)}</p>;

  return (
    <div className="builder">
      <div className="columns">
        <OfferColumn title="✈️ Vuelos ida y vuelta" subtitle={`${w.origin} ⇄ ${w.destination} · Google Flights`}>
          {flights.map((f) => (
            <button key={f.id} className={f.id === flightId ? 'offer selected' : 'offer'} onClick={() => setFlightId(f.id)}>
              <div className="offer-main">
                <strong>{f.airline}</strong>
                <span>
                  {f.departTime} → {f.arriveTime} · {duration(f.durationMinutes)}
                </span>
                <span className="muted tiny">
                  {f.stops === 0 ? 'Directo' : `${f.stops} escala(s)`} · {f.seatsAvailable} sillas
                </span>
              </div>
              <span className="price">{money(f.priceCop)}</span>
            </button>
          ))}
        </OfferColumn>

        <OfferColumn title="🏨 Hoteles" subtitle={`${w.destinationName} · Google Hotels`}>
          {hotels.map((h) => (
            <button key={h.id} className={h.id === hotelId ? 'offer selected' : 'offer'} onClick={() => setHotelId(h.id)}>
              {h.imageUrl && <img src={h.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              <div className="offer-main">
                <strong>{h.name}</strong>
                <span className="muted tiny">
                  {h.rating ? `★ ${h.rating} (${h.reviews ?? 0})` : 'Sin calificación'}
                  {h.stars ? ` · ${h.stars} estrellas` : ''} · {h.roomsAvailable} hab.
                </span>
                {h.deal && <span className="deal">{h.deal}</span>}
              </div>
              <span className="price">
                {money(h.totalPriceCop)}
                <small>{money(h.pricePerNightCop)}/noche</small>
              </span>
            </button>
          ))}
        </OfferColumn>

        <OfferColumn title="🚗 Autos" subtitle={`Aeropuerto ${w.destination} · Kayak`}>
          {cars.map((c) => (
            <button key={c.id} className={c.id === carId ? 'offer selected' : 'offer'} onClick={() => setCarId(c.id)}>
              {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="car-img" />}
              <div className="offer-main">
                <strong>{c.model}</strong>
                <span className="muted tiny">
                  {c.category ?? 'Auto'} · {c.transmission ?? '—'} · {c.passengers ?? '?'} pasajeros
                </span>
                <span className="muted tiny">
                  {c.provider} · {c.unitsAvailable} disp.
                </span>
              </div>
              <span className="price">{money(c.totalPriceCop)}</span>
            </button>
          ))}
        </OfferColumn>
      </div>

      <aside className="summary">
        <h3>Tu paquete</h3>
        <p className="muted">
          {w.destinationName} · {shortDate(w.checkIn)} al {shortDate(w.checkOut)}
        </p>
        <dl>
          <dt>Vuelo × {travelers}</dt>
          <dd>{money(flight ? flight.priceCop * travelers : null)}</dd>
          <dt>Hotel ({w.nights} noches)</dt>
          <dd>{money(hotel?.totalPriceCop)}</dd>
          <dt>Auto ({w.nights} días)</dt>
          <dd>{money(car?.totalPriceCop)}</dd>
          <dt className="total">Total</dt>
          <dd className="total">{money(total)}</dd>
        </dl>
        <label>
          Viajeros
          <select value={travelers} onChange={(e) => setTravelers(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-switch">
          🧪 Modo demo · simular fallo en la SAGA
          <select value={failure} onChange={(e) => setFailure(e.target.value)}>
            {FAILURES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {booking.error && <p className="error">{errorMessage(booking.error)}</p>}
        <button className="primary block" disabled={!flight || !hotel || !car || booking.loading} onClick={reserve}>
          {booking.loading ? 'Iniciando SAGA…' : user ? 'Reservar paquete' : 'Inicia sesión para reservar'}
        </button>
      </aside>
    </div>
  );
}

function OfferColumn({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="column">
      <header>
        <h3>{title}</h3>
        <span className="muted tiny">{subtitle}</span>
      </header>
      <div className="offers">{empty ? <p className="muted">Sin ofertas para esta ventana.</p> : children}</div>
    </section>
  );
}
