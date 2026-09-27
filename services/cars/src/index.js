// Microservicio de AUTOS
// Dueño del catálogo public.car_offers (unidades disponibles) y del esquema
// `cars` (reservas). Participante de la SAGA: reservar / cancelar vehículo.
import { createApp, createPool, listen, mountInventory } from '@wandersync/common';

const PORT = Number(process.env.PORT || 4103);
const app = createApp('cars');
const pool = createPool();

mountInventory(app, pool, {
  name: 'cars',
  label: 'autos',
  collection: 'carOffersCollection',
  offerTable: 'public.car_offers',
  stockColumn: 'units_available',
  reservationTable: 'cars.reservations',
  quantityColumn: null,
  quantity: () => 1,
  orderBy: 'totalPriceCop',
  fields: [
    'id', 'searchKey', 'source', 'pickupCode', 'pickupLocation', 'pickupDate', 'dropoffDate', 'days',
    'model', 'category', 'provider', 'totalPriceCop', 'passengers', 'bags', 'doors', 'transmission',
    'score', 'imageUrl', 'unitsAvailable', 'scrapedAt',
  ],
  windowsSql: `
    select search_key as "searchKey", count(*)::int as offers,
           min(total_price_cop)::int as "minPriceCop", max(scraped_at) as "scrapedAt"
      from public.car_offers
     where is_active and pickup_date >= current_date
     group by search_key`,
});

listen(app, PORT, 'cars');
