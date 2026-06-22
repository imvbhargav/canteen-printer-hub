export interface TicketItem {
  name: string;
  quantity: number;
  unitPrice: string;
  itemTotal: string;
}

export interface Ticket {
  orderId: string;
  counterId: string;
  ticketReference: string;
  netTotal: string;
  items: TicketItem[];
  createdAt: string;
  status?: 'PENDING' | 'READY' | 'COMPLETED' | 'CANCELLED';
}

export interface CounterConfig {
  id: string;
  counterNumber: number;
  displayName: string;
  printerType: 'LAN' | 'BT' | 'USB' | 'NONE';
  printerAddress: string | null;
  status: 'ACTIVE' | 'PRINTER_ISSUE' | 'OFFLINE';
  deviceIdentifier: string | null;
  isActive: boolean;
}
