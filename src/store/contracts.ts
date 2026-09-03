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

export interface CreateCheckoutResponse {
  readonly clientSecret: string;
  readonly currency: string;
  readonly expiresAt: string;
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
