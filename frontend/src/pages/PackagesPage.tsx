import { useMutation, useQuery } from '@apollo/client';
import { BedDouble, Car as CarIcon, Check, Minus, Plane, Plus, Star, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { User } from '../App';
import { Guilloche, Microprint } from '../components/Paper';
import { amount, dateRange, duration, errorMessage, money, shortDate, timeAgo, voucherCode } from '../format';
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
type Stub = 'flight' | 'hotel' | 'car';

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

  // Un tiquete por destino; si hay varias fechas capturadas, se eligen aparte.
  const byDestination = new Map<string, TripWindow[]>();
  for (const w of windows) byDestination.set(w.destination, [...(byDestination.get(w.destination) ?? []), w]);
  const destinationsList = [...byDestination.values()];
  const dates = active ? byDestination.get(active.destination) ?? [] : [];

  useEffect(() => {
    if (!searchKey && windows.length) setSearchKey(windows[0].searchKey);
  }, [windows, searchKey]);

  function pickDestination(group: TripWindow[]) {
    const sameDates = group.find((w) => active && w.checkIn === active.checkIn);
    setSearchKey((sameDates ?? group[0]).searchKey);
  }

  return (
    <div className="page">
      <section className="departures" aria-label="Destinos disponibles">
        <div className="departures-head">
          <h1>¿A dónde viajas desde Bogotá?</h1>
          <p>
            Tarifas reales del día de Google Flights, Google Hotels y Kayak. Vuelo, hotel y auto se reservan juntos, o no
            se reserva nada.
          </p>
        </div>

        {destinations.loading && !windows.length && <p className="note-on-navy">Cargando destinos…</p>}
        {destinations.error && <p className="error">{errorMessage(destinations.error)}</p>}
        {!destinations.loading && !windows.length && !destinations.error && (
          <p className="note-on-navy">
            Todavía no hay tarifas. La primera ingesta corre al arrancar el sistema; revisa la pestaña Ingesta de datos.
          </p>
        )}

        <div className="tickets" role="radiogroup" aria-label="Destino">
          {destinationsList.map((group) => {
            const selected = group.some((w) => w.searchKey === searchKey);
            const w = (selected && active) || group.find((g) => active && g.checkIn === active.checkIn) || group[0];
            const from = (w.minFlightPriceCop ?? 0) + (w.minHotelPriceCop ?? 0) + (w.minCarPriceCop ?? 0);
            return (
              <button
                key={w.destination}
                role="radio"
                aria-checked={selected}
                className={selected ? 'ticket selected' : 'ticket'}
                onClick={() => pickDestination(group)}
              >
                <span className="ticket-code">{w.destination}</span>
                <span className="ticket-side">
                  <span className="ticket-city">{w.destinationName}</span>
                  <span className="ticket-dates">{dateRange(w.checkIn, w.checkOut)}</span>
                  <span className="ticket-price">
                    <small>desde</small> {money(from)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {dates.length > 1 && (
          <div className="date-pills" role="radiogroup" aria-label="Fechas disponibles">
            <span className="field-label">Fechas con tarifas</span>
            {dates.map((w) => (
              <button
                key={w.searchKey}
                role="radio"
                aria-checked={w.searchKey === searchKey}
                className={w.searchKey === searchKey ? 'date-pill selected' : 'date-pill'}
                onClick={() => setSearchKey(w.searchKey)}
              >
                {shortDate(w.checkIn)} – {shortDate(w.checkOut)} · {w.nights} noches
              </button>
            ))}
          </div>
        )}
      </section>

      {active && <PackageBuilder key={active.searchKey} trip={active} user={user} onNeedAuth={onNeedAuth} onBooked={onBooked} />}
    </div>
  );
}

function PackageBuilder({ trip, user, onNeedAuth, onBooked }: { trip: TripWindow } & Props) {
  const { data, loading, error } = useQuery<{ packageSearch: { flights: Flight[]; hotels: Hotel[]; cars: Car[] } }>(
    PACKAGE_SEARCH,
    { variables: { searchKey: trip.searchKey } },
  );
  const [stub, setStub] = useState<Stub>('flight');
  const [flightId, setFlightId] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [carId, setCarId] = useState<string | null>(null);
  const [travelers, setTravelers] = useState(1);
  const [failure, setFailure] = useState('NONE');
  const voucherRef = useRef<HTMLElement>(null);
  const [book, booking] = useMutation<{ bookPackage: { id: string } }>(BOOK_PACKAGE, {
    refetchQueries: [{ query: MY_ORDERS }],
  });

  const flights = data?.packageSearch.flights ?? [];
  const hotels = data?.packageSearch.hotels ?? [];
  const cars = data?.packageSearch.cars ?? [];

  // Preselecciona la tarifa más económica de cada talón.
  useEffect(() => {
    if (!flightId && flights[0]) setFlightId(flights[0].id);
    if (!hotelId && hotels[0]) setHotelId(hotels[0].id);
    if (!carId && cars[0]) setCarId(cars[0].id);
  }, [flights, hotels, cars, flightId, hotelId, carId]);

  const flight = flights.find((f) => f.id === flightId);
  const hotel = hotels.find((h) => h.id === hotelId);
  const car = cars.find((c) => c.id === carId);
  const total = (flight ? flight.priceCop * travelers : 0) + (hotel?.totalPriceCop ?? 0) + (car?.totalPriceCop ?? 0);
  const ready = Boolean(flight && hotel && car);

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

  const SHEETS: { id: Stub; label: string; count: number; source: string; Icon: typeof Plane }[] = [
    { id: 'flight', label: 'Vuelos', count: flights.length, source: 'Google Flights · ida y vuelta', Icon: Plane },
    { id: 'hotel', label: 'Hoteles', count: hotels.length, source: `Google Hotels · ${trip.nights} noches`, Icon: BedDouble },
    { id: 'car', label: 'Autos', count: cars.length, source: `Kayak · aeropuerto ${trip.destination}`, Icon: CarIcon },
  ];
  const rowsFor = { flight: flights, hotel: hotels, car: cars }[stub];
  const reserveLabel = booking.loading ? 'Iniciando SAGA…' : user ? 'Reservar paquete' : 'Inicia sesión para reservar';

  return (
    <div className="builder">
      <section className="ratesheet" aria-label="Tarifario">
        <div className="sheet-tabs" role="tablist">
          {SHEETS.map(({ id, label, count, source, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={stub === id}
              className={`sheet-tab tint-${id} ${stub === id ? 'active' : ''}`}
              onClick={() => setStub(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="sheet-tab-label">
                {label} <span className="count">{count}</span>
              </span>
              <span className="sheet-tab-source">{source}</span>
            </button>
          ))}
        </div>

        <div className={`tariff tint-${stub}`} role="tabpanel">
          {loading && !data && <p className="sheet-empty">Consultando el tarifario…</p>}
          {error && <p className="error">{errorMessage(error)}</p>}

          {stub === 'flight' && flights.length > 0 && (
            <>
              <div className="tariff-head cols-flight" aria-hidden="true">
                <span />
                <span>Aerolínea · salida → llegada</span>
                <span>Duración</span>
                <span>Escalas</span>
                <span className="r">Sillas</span>
                <span className="r">Tarifa p/p</span>
              </div>
              <ol className="tariff-rows">
                {flights.map((f) => (
                  <li key={f.id}>
                    <button className={`tariff-row cols-flight ${f.id === flightId ? 'selected' : ''}`} onClick={() => setFlightId(f.id)} aria-pressed={f.id === flightId}>
                      <span className="tick" aria-hidden="true">{f.id === flightId && <Check size={16} strokeWidth={3} />}</span>
                      <span className="cell-main">
                        <strong>{f.airline}</strong>
                        <span className="typed">
                          {f.departTime} → {f.arriveTime}
                        </span>
                      </span>
                      <span className="typed cell">{duration(f.durationMinutes)}</span>
                      <span className="typed cell">{f.stops === 0 ? 'directo' : `${f.stops} escala${f.stops > 1 ? 's' : ''}`}</span>
                      <span className="typed cell r">{f.seatsAvailable}</span>
                      <span className="fare r">{money(f.priceCop)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {stub === 'hotel' && hotels.length > 0 && (
            <>
              <div className="tariff-head cols-hotel" aria-hidden="true">
                <span />
                <span />
                <span>Hotel · calificación</span>
                <span className="r">Hab.</span>
                <span className="r">Noche</span>
                <span className="r">Estadía</span>
              </div>
              <ol className="tariff-rows">
                {hotels.map((h) => (
                  <li key={h.id}>
                    <button className={`tariff-row cols-hotel ${h.id === hotelId ? 'selected' : ''}`} onClick={() => setHotelId(h.id)} aria-pressed={h.id === hotelId}>
                      <span className="tick" aria-hidden="true">{h.id === hotelId && <Check size={16} strokeWidth={3} />}</span>
                      <span className="snapshot">
                        {h.imageUrl ? <img src={h.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <BedDouble size={20} />}
                      </span>
                      <span className="cell-main">
                        <strong>{h.name}</strong>
                        <span className="cell-meta">
                          {h.rating ? (
                            <>
                              <Star size={13} className="star" aria-hidden="true" /> {h.rating.toLocaleString('es-CO')}{' '}
                              <span className="dim">({h.reviews ?? 0})</span>
                            </>
                          ) : (
                            <span className="dim">Sin calificación</span>
                          )}
                          {h.stars ? <span className="dim"> · {h.stars} estrellas</span> : null}
                          {h.deal && <span className="deal">{h.deal}</span>}
                        </span>
                      </span>
                      <span className="typed cell r">{h.roomsAvailable}</span>
                      <span className="typed cell r">{money(h.pricePerNightCop)}</span>
                      <span className="fare r">{money(h.totalPriceCop)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {stub === 'car' && cars.length > 0 && (
            <>
              <div className="tariff-head cols-car" aria-hidden="true">
                <span />
                <span />
                <span>Modelo · proveedor</span>
                <span>Categoría</span>
                <span className="r">Disp.</span>
                <span className="r">{trip.nights} días</span>
              </div>
              <ol className="tariff-rows">
                {cars.map((c) => (
                  <li key={c.id}>
                    <button className={`tariff-row cols-car ${c.id === carId ? 'selected' : ''}`} onClick={() => setCarId(c.id)} aria-pressed={c.id === carId}>
                      <span className="tick" aria-hidden="true">{c.id === carId && <Check size={16} strokeWidth={3} />}</span>
                      <span className="snapshot snapshot-car">
                        {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <CarIcon size={20} />}
                      </span>
                      <span className="cell-main">
                        <strong>{c.model}</strong>
                        <span className="typed small">{c.provider}</span>
                      </span>
                      <span className="typed cell">
                        {c.category ?? 'Auto'} · {c.transmission ?? '—'} · {c.passengers ?? '?'} pas.
                      </span>
                      <span className="typed cell r">{c.unitsAvailable}</span>
                      <span className="fare r">{money(c.totalPriceCop)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          {data && !rowsFor.length && <p className="sheet-empty">No hay tarifas de este tipo para esta fecha.</p>}
          <p className="tariff-foot typed small">Tarifas capturadas {timeAgo(trip.scrapedAt)} por los workers de Dask.</p>
        </div>
      </section>

      <aside className="voucher" aria-label="Bono de viaje" ref={voucherRef}>
        <Guilloche className="voucher-guilloche" />
        <header className="voucher-head">
          <div>
            <span className="voucher-title">Bono de viaje</span>
            <span className="voucher-agency">WanderSync Travel Solutions</span>
          </div>
          <span className="serial" aria-label="Número de bono">
            Nº {voucherCode(trip.searchKey)}
          </span>
        </header>
        <Microprint />

        <div className="voucher-route">
          <span className="iata">{trip.origin}</span>
          <svg className="route-arc" viewBox="0 0 120 30" aria-hidden="true">
            <path d="M4 26 Q60 -8 116 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
            <circle cx="116" cy="26" r="3.5" fill="currentColor" />
          </svg>
          <span className="iata">{trip.destination}</span>
          <span className="typed route-dates">
            {shortDate(trip.checkIn)} → {shortDate(trip.checkOut)} · {trip.nights} noches
          </span>
          <span className="stepper" role="group" aria-label="Viajeros">
            <button onClick={() => setTravelers(Math.max(1, travelers - 1))} disabled={travelers <= 1} aria-label="Quitar viajero">
              <Minus size={13} />
            </button>
            <span className="typed" aria-live="polite">
              <Users size={14} aria-hidden="true" /> {travelers}
            </span>
            <button onClick={() => setTravelers(Math.min(4, travelers + 1))} disabled={travelers >= 4} aria-label="Agregar viajero">
              <Plus size={13} />
            </button>
          </span>
        </div>

        <div className="stubs">
          <StubRow
            kind="flight"
            active={stub === 'flight'}
            onClick={() => setStub('flight')}
            title={flight ? flight.airline : 'Elige un vuelo'}
            detail={flight ? `${flight.departTime} → ${flight.arriveTime} · ida y vuelta × ${travelers}` : '—'}
            value={flight ? flight.priceCop * travelers : null}
          />
          <StubRow
            kind="hotel"
            active={stub === 'hotel'}
            onClick={() => setStub('hotel')}
            title={hotel ? hotel.name : 'Elige un hotel'}
            detail={hotel ? `${trip.nights} noches · 1 habitación` : '—'}
            value={hotel?.totalPriceCop ?? null}
          />
          <StubRow
            kind="car"
            active={stub === 'car'}
            onClick={() => setStub('car')}
            title={car ? car.model : 'Elige un auto'}
            detail={car ? `${car.provider ?? ''} · ${trip.nights} días` : '—'}
            value={car?.totalPriceCop ?? null}
          />
        </div>

        <div className="voucher-checkout">
          <div className="voucher-total">
            <span className="field-label">Total · COP</span>
            <span className="total-figure">
              <span className="currency">$</span>
              {amount(total)}
            </span>
          </div>
          <button className="btn-issue" disabled={!ready || booking.loading} onClick={reserve}>
            {reserveLabel}
          </button>
        </div>

        <label className="demo-instruction">
          <span className="demo-label">Modo demo · simular fallo</span>
          <select value={failure} onChange={(e) => setFailure(e.target.value)} aria-label="Simular fallo en la SAGA">
            {FAILURES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {booking.error && <p className="error">{errorMessage(booking.error)}</p>}
      </aside>

      {/* Barra compacta en móvil: el total y la acción siempre a mano. */}
      <div className="checkout-bar" aria-hidden="false">
        <button className="checkout-bar-total" onClick={() => voucherRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <span className="field-label">Ver bono · {travelers} viajero(s)</span>
          <span className="checkout-bar-figure">{money(total)}</span>
        </button>
        <button className="btn-issue" disabled={!ready || booking.loading} onClick={reserve}>
          {user ? 'Reservar' : 'Iniciar sesión'}
        </button>
      </div>
    </div>
  );
}

const STUB_META = {
  flight: { label: 'Talón de vuelo', Icon: Plane },
  hotel: { label: 'Talón de hotel', Icon: BedDouble },
  car: { label: 'Talón de auto', Icon: CarIcon },
};

function StubRow({ kind, active, onClick, title, detail, value }: { kind: Stub; active: boolean; onClick: () => void; title: string; detail: string; value: number | null }) {
  const { label, Icon } = STUB_META[kind];
  return (
    <button className={`stub tint-${kind} ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="stub-icon" />
      <span className="stub-body">
        <span className="field-label">
          {label}
          {active && <span className="stub-editing">en el tarifario</span>}
        </span>
        <strong>{title}</strong>
        <span className="typed small">{detail}</span>
      </span>
      <span className="stub-value">{money(value)}</span>
    </button>
  );
}
