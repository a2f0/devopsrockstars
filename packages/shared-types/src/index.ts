export interface StoreVariant {
  readonly id: string;
  readonly label: string;
  readonly sku: string;
  readonly unitAmount: number;
  readonly currency: string;
  readonly availableQuantity: number;
}

export interface StoreProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly description: string;
  readonly imagePath: string;
  readonly variants: readonly StoreVariant[];
}

export interface StorefrontResponse {
  readonly products: readonly StoreProduct[];
  readonly stripePublishableKey: string | null;
}

export interface CartItemInput {
  readonly variantId: string;
  readonly quantity: number;
}

export interface ShippingInput {
  readonly name: string;
  readonly email: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: 'US';
}

export interface CreateCheckoutRequest {
  readonly items: readonly CartItemInput[];
  readonly shipping: ShippingInput;
}

interface CheckoutLineSnapshot {
  readonly currency: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly variantId: string;
  readonly variantLabel: string;
}

export interface CreateCheckoutResponse {
  readonly clientSecret: string;
  readonly currency: string;
  readonly expiresAt: string;
  readonly lines: readonly CheckoutLineSnapshot[];
  readonly orderId: string;
  readonly orderToken: string;
  readonly totalAmount: number;
}

export type StoreOrderStatus =
  | 'creating_payment'
  | 'awaiting_payment'
  | 'paid'
  | 'canceled';

export interface StoreOrderResponse {
  readonly currency: string;
  readonly expiresAt: string;
  readonly orderId: string;
  readonly status: StoreOrderStatus;
  readonly totalAmount: number;
}

export interface StoreErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface AdminVariant {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly unitAmount: number;
  readonly currency: string;
  // Unreserved stock; checkout reservations are already subtracted.
  readonly inventoryQuantity: number;
  readonly reservedQuantity: number;
  readonly soldQuantity: number;
  readonly active: boolean;
  readonly updatedAt: string;
}

export interface AdminProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly active: boolean;
  readonly variants: readonly AdminVariant[];
}

export interface AdminInventoryResponse {
  readonly products: readonly AdminProduct[];
}

// Inventory changes name the quantity they replace, so a checkout that
// reserves or releases stock meanwhile is reported instead of overwritten.
export interface AdminVariantUpdateRequest {
  readonly expectedInventoryQuantity?: number;
  readonly inventoryQuantity?: number;
  readonly unitAmount?: number;
  readonly active?: boolean;
}

export interface AdminProductUpdateRequest {
  readonly active: boolean;
}

export const adminOrderFilters = [
  'all',
  'paid',
  'awaiting_payment',
  'creating_payment',
  'canceled',
] as const;
export type AdminOrderFilter = (typeof adminOrderFilters)[number];

export interface AdminOrderItem {
  readonly sku: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly unitAmount: number;
  readonly quantity: number;
  readonly lineTotal: number;
}

export interface AdminOrder {
  readonly id: string;
  readonly status: StoreOrderStatus;
  readonly currency: string;
  readonly subtotalAmount: number;
  readonly shippingAmount: number;
  readonly totalAmount: number;
  readonly email: string;
  readonly shipping: {
    readonly name: string;
    readonly addressLine1: string;
    readonly addressLine2: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly stripePaymentIntentId: string | null;
  readonly reservationExpiresAt: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly canceledAt: string | null;
  readonly items: readonly AdminOrderItem[];
}

export interface AdminOrdersResponse {
  readonly orders: readonly AdminOrder[];
  readonly counts: Readonly<Record<StoreOrderStatus, number>>;
  readonly nextCursor: string | null;
}

export interface AdminAlert {
  readonly eventId: string;
  readonly reason: string;
  readonly action: 'investigate' | 'refund';
  readonly status: 'open' | 'resolved';
  readonly orderId: string;
  readonly paymentIntentId: string;
  readonly amountReceived: number | null;
  readonly currency: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface AdminAlertsResponse {
  readonly alerts: readonly AdminAlert[];
}
