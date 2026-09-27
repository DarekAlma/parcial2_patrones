#!/usr/bin/env node
// Ejecuta los escenarios de la SAGA de punta a punta por GraphQL y verifica
// la consistencia del inventario después de cada compensación.
//
//   node scripts/e2e/saga-scenarios.mjs            # los 5 escenarios
//   node scripts/e2e/saga-scenarios.mjs CAR        # solo uno
//
// Escenarios: NONE (happy path), FLIGHT, HOTEL, CAR (servicio caído -> reintentos
// -> compensación) y PAYMENT (pago rechazado -> compensación sin reintentos).
import { c, GqlClient, randomUser, sleep } from '../lib/gql.mjs';

const ONLY = process.argv[2]?.toUpperCase();
const SCENARIOS = ['NONE', 'FLIGHT', 'HOTEL', 'CAR', 'PAYMENT'].filter((s) => !ONLY || s === ONLY);

const STOCK = `
  query Stock($searchKey: String!) {
    packageSearch(searchKey: $searchKey) {
      flights(limit: 30) { id airline priceCop seatsAvailable }
      hotels(limit: 30) { id name totalPriceCop roomsAvailable }
      cars(limit: 30) { id model totalPriceCop unitsAvailable }
    }
  }`;

const ORDER = `
  query Order($id: ID!) {
    order(id: $id) {
      id status totalCop failureReason paymentStatus invoiceNumber
      saga { status flowRunUrl steps { step action status detail } }
    }
  }`;

const gql = new GqlClient();
const user = randomUser('saga');
await gql.data(`mutation($input: RegisterInput!) { register(input: $input) { user { email } } }`, { input: user });
console.log(c.dim(`Usuario de prueba: ${user.email}`));

const { destinations } = await gql.data(`{ destinations { searchKey destinationName hotelOffers carOffers } }`);
const trip = destinations.find((d) => d.hotelOffers > 0 && d.carOffers > 0);
if (!trip) {
  console.error(c.bad('No hay una ventana con vuelos, hoteles y autos. ¿Terminó la primera ingesta?'));
  process.exit(1);
}
console.log(c.bold(`Destino: ${trip.destinationName} (${trip.searchKey})\n`));

let failures = 0;
for (const scenario of SCENARIOS) {
  const before = (await gql.data(STOCK, { searchKey: trip.searchKey })).packageSearch;
  const [flight, hotel, car] = [before.flights[0], before.hotels[0], before.cars[0]];

  const { bookPackage } = await gql.data(
    `mutation($input: BookPackageInput!) { bookPackage(input: $input) { id status } }`,
    { input: { flightOfferId: flight.id, hotelOfferId: hotel.id, carOfferId: car.id, travelers: 1, simulateFailure: scenario } },
  );

  let order;
  for (let i = 0; i < 90; i += 1) {
    order = (await gql.data(ORDER, { id: bookPackage.id })).order;
    if (['CONFIRMED', 'COMPENSATED', 'FAILED'].includes(order.status) && order.saga?.status !== 'RUNNING') break;
    await sleep(1000);
  }

  const after = (await gql.data(STOCK, { searchKey: trip.searchKey })).packageSearch;
  const find = (list, id) => list.find((o) => o.id === id);
  const delta = {
    seats: find(after.flights, flight.id).seatsAvailable - flight.seatsAvailable,
    rooms: find(after.hotels, hotel.id).roomsAvailable - hotel.roomsAvailable,
    units: find(after.cars, car.id).unitsAvailable - car.unitsAvailable,
  };

  const expected = scenario === 'NONE' ? 'CONFIRMED' : 'COMPENSATED';
  const expectedDelta = scenario === 'NONE' ? { seats: -1, rooms: -1, units: -1 } : { seats: 0, rooms: 0, units: 0 };
  const consistent = JSON.stringify(delta) === JSON.stringify(expectedDelta);
  const pass = order.status === expected && consistent;
  if (!pass) failures += 1;

  console.log(`${pass ? c.ok('✔ PASA') : c.bad('✘ FALLA')}  ${c.bold(`Escenario ${scenario}`)} → orden ${order.status}` +
    (order.invoiceNumber ? ` · factura ${order.invoiceNumber}` : '') +
    (order.failureReason ? c.dim(` · ${order.failureReason}`) : ''));
  for (const s of order.saga?.steps ?? []) {
    if (s.status === 'RUNNING' && (s.detail?.attempt ?? 1) === 1) continue;
    const label = s.status === 'RUNNING' ? `reintento ${s.detail.attempt - 1}` : s.status;
    const color = { SUCCESS: c.ok, FAILED: c.bad, COMPENSATED: c.warn }[s.status] ?? c.dim;
    console.log(`     ${s.action === 'COMPENSATE' ? '↩' : '→'} ${s.step.padEnd(12)} ${color(label)}`);
  }
  console.log(c.dim(`     inventario Δ sillas ${delta.seats}, habitaciones ${delta.rooms}, autos ${delta.units} ` +
    `(${consistent ? 'consistente' : 'INCONSISTENTE'}) · ${order.saga?.flowRunUrl ?? ''}\n`));
}

console.log(failures ? c.bad(`${failures} escenario(s) fallaron`) : c.ok('Todos los escenarios de la SAGA pasaron.'));
process.exit(failures ? 1 : 0);
