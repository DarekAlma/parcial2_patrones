"""Scrapers de fuentes reales: Google Flights, Google Hotels y Kayak."""
from wandersync.scrapers import google_flights, google_hotels, kayak_cars

SCRAPERS = {
    "flights": google_flights,
    "hotels": google_hotels,
    "cars": kayak_cars,
}
