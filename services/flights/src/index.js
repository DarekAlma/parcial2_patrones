// Microservicio de VUELOS
// Dueño del catálogo public.flight_offers (inventario de sillas) y del esquema
// `flights` (reservas). Participante de la SAGA: reservar / cancelar vuelo.
import { createApp, createPool, listen, mountInventory } from '@wandersync/common';

const PORT = Number(process.env.PORT || 4101);
const app = createApp('flights');
const pool = createPool();

mountInventory(app, pool, {
  name: 'flights',
  label: 'vuelos',
  collection: 'flightOffersCollection',
  offerTable: 'public.flight_offers',
  stockColumn: 'seats_available',
  reservationTable: 'flights.reservations',
  quantityColumn: 'passengers',
  quantity: (body) => body.passengers,
  orderBy: 'priceCop',
  fields: [
    'id', 'searchKey', 'source', 'origin', 'destination', 'departureDate', 'returnDate', 'airline',
    'operatedBy', 'stops', 'departTime', 'arriveTime', 'durationMinutes', 'originAirport',
    'destinationAirport', 'priceCop', 'seatsAvailable', 'scrapedAt',
  ],
  windowsSql: `
    select search_key as "searchKey", origin, destination,
           departure_date::text as "checkIn", return_date::text as "checkOut",
           count(*)::int as offers, min(price_cop)::int as "minPriceCop", max(scraped_at) as "scrapedAt"
      from public.flight_offers
     where is_active and departure_date >= current_date
     group by search_key, origin, destination, departure_date, return_date
     order by departure_date, destination`,
});

listen(app, PORT, 'flights');
