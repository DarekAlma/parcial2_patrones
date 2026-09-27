// Microservicio de HOTELES
// Dueño del catálogo public.hotel_offers (inventario de habitaciones) y del
// esquema `hotels` (reservas). Participante de la SAGA: reservar / cancelar.
import { createApp, createPool, listen, mountInventory } from '@wandersync/common';

const PORT = Number(process.env.PORT || 4102);
const app = createApp('hotels');
const pool = createPool();

mountInventory(app, pool, {
  name: 'hotels',
  label: 'hoteles',
  collection: 'hotelOffersCollection',
  offerTable: 'public.hotel_offers',
  stockColumn: 'rooms_available',
  reservationTable: 'hotels.reservations',
  quantityColumn: 'guests',
  // Una reserva = una habitación; se registra el número de huéspedes.
  quantity: (body) => body.guests,
  orderBy: 'totalPriceCop',
  fields: [
    'id', 'searchKey', 'source', 'cityCode', 'cityName', 'checkIn', 'checkOut', 'nights', 'name',
    'pricePerNightCop', 'totalPriceCop', 'rating', 'reviews', 'stars', 'deal', 'amenities',
    'imageUrl', 'detailUrl', 'roomsAvailable', 'scrapedAt',
  ],
  windowsSql: `
    select search_key as "searchKey", count(*)::int as offers,
           min(total_price_cop)::int as "minPriceCop", max(scraped_at) as "scrapedAt"
      from public.hotel_offers
     where is_active and check_in >= current_date
     group by search_key`,
});

listen(app, PORT, 'hotels');
