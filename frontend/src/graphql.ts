import { gql } from '@apollo/client';

// Cada operación pide exactamente los campos que la vista pinta:
// nada de over-fetching (compárelo con el esquema completo en /graphql).

export const ME = gql`
  query Me {
    me { id email fullName }
  }
`;

export const DESTINATIONS = gql`
  query Destinations {
    destinations {
      searchKey origin destination destinationName checkIn checkOut nights
      flightOffers hotelOffers carOffers
      minFlightPriceCop minHotelPriceCop minCarPriceCop scrapedAt
    }
  }
`;

export const PACKAGE_SEARCH = gql`
  query PackageSearch($searchKey: String!) {
    packageSearch(searchKey: $searchKey) {
      searchKey
      flights(limit: 12) {
        id airline stops departTime arriveTime durationMinutes priceCop seatsAvailable
      }
      hotels(limit: 12) {
        id name pricePerNightCop totalPriceCop nights rating reviews stars deal imageUrl roomsAvailable
      }
      cars(limit: 12) {
        id model category provider totalPriceCop passengers transmission imageUrl unitsAvailable
      }
    }
  }
`;

export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) { sessionRegenerated user { id email fullName } }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { sessionRegenerated user { id email fullName } }
  }
`;

export const LOGOUT = gql`
  mutation Logout {
    logout
  }
`;

export const BOOK_PACKAGE = gql`
  mutation BookPackage($input: BookPackageInput!) {
    bookPackage(input: $input) { id status totalCop }
  }
`;

const ORDER_FIELDS = gql`
  fragment OrderSummary on Order {
    id status searchKey travelers totalCop simulateFailure failureReason createdAt
  }
`;

export const MY_ORDERS = gql`
  ${ORDER_FIELDS}
  query MyOrders {
    myOrders { ...OrderSummary }
  }
`;

export const ORDER_DETAIL = gql`
  ${ORDER_FIELDS}
  query OrderDetail($id: ID!) {
    order(id: $id) {
      ...OrderSummary
      flightTotalCop hotelTotalCop carTotalCop paymentStatus invoiceNumber
      flight { id airline departTime arriveTime stops }
      hotel { id name stars }
      car { id model provider }
      saga {
        status flowRunUrl startedAt finishedAt
        steps { step action status detail at }
      }
    }
  }
`;

export const INGESTION_RUNS = gql`
  query IngestionRuns {
    ingestionRuns(limit: 8) {
      id flowRunName status chaosFailRate flights hotels cars failedTasks detail startedAt finishedAt flowRunUrl
    }
    platformLinks { prefectUrl daskDashboardUrl graphqlUrl }
  }
`;

export const TRIGGER_INGESTION = gql`
  mutation TriggerIngestion($chaosFailRate: Float!) {
    triggerIngestion(chaosFailRate: $chaosFailRate) { flowRunId flowRunName flowRunUrl }
  }
`;
