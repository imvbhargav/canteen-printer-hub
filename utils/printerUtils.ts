import { Ticket } from '../types';
import EscPosEncoder from 'esc-pos-encoder';

export const formatPrice = (val: unknown): string => {
  const num: number = Number(val);
  return isNaN(num) ? '0' : Math.round(num).toString();
};

export const generateReceiptBytes = (
  ticket: Ticket,
  paperWidth: number = 48,
): Uint8Array => {
  const encoder = new EscPosEncoder();
  const underlineSeparator: string = '_'.repeat(paperWidth);
  const dashSeparator: string = '-'.repeat(paperWidth);

  encoder
    .initialize()
    .codepage('cp437')
    .align('center')
    .bold(true)
    .line('BMSCW CANTEEN')
    .bold(false)
    .line('Basavanagudi')
    .line('+91 77607 62484')
    .line(underlineSeparator)
    .feed(1);

  const timestamp: Date = ticket.createdAt
    ? new Date(ticket.createdAt)
    : new Date();
  const dateStr: string = timestamp.toLocaleDateString('en-GB');
  const timeStr: string = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  encoder.align('center').line(`Date: ${dateStr}   Time: ${timeStr}`).feed(1);

  const tokenNo: string = ticket.ticketReference || 'XXXX';
  encoder
    .align('center')
    .bold(true)
    .size('2x')
    .line(`TOKEN: ${tokenNo}`)
    .size('normal')
    .bold(false)
    .feed(1);

  encoder.align('left').line(dashSeparator);

  const amtColWidth = 8;
  const qtyColWidth = 6;
  const itemNameWidth: number = paperWidth - amtColWidth - qtyColWidth;

  const headerItem: string = 'Item'.padEnd(itemNameWidth, ' ');
  const headerQty: string = 'Qty'.padStart(qtyColWidth, ' ');
  const headerAmt: string = 'Amt'.padStart(amtColWidth, ' ');

  encoder.line(`${headerItem}${headerQty}${headerAmt}`).line(dashSeparator);

  const items = ticket.items || [];
  items.forEach((item: any) => {
    const cleanAmt: string = formatPrice(item.itemTotal);
    const cleanQty: string = String(item.quantity);
    let nameString: string = item.name;

    if (nameString.length > itemNameWidth) {
      nameString = nameString.substring(0, itemNameWidth - 3) + '...';
    } else {
      nameString = nameString.padEnd(itemNameWidth, ' ');
    }

    const colQty: string = cleanQty.padStart(qtyColWidth, ' ');
    const colAmt: string = cleanAmt.padStart(amtColWidth, ' ');

    encoder.line(`${nameString}${colQty}${colAmt}`);
  });

  const rawNetTotal: string = ticket.netTotal || '0.00';
  const totalAmountFormatted: string = `Rs.${formatPrice(rawNetTotal)}`;

  const totalLabelWidth: number = paperWidth - amtColWidth;
  const totalLabel: string = 'TOTAL'.padEnd(totalLabelWidth, ' ');
  const totalValRight: string = totalAmountFormatted.padStart(amtColWidth, ' ');

  encoder
    .line(dashSeparator)
    .bold(true)
    .line(`${totalLabel}${totalValRight}`)
    .bold(false)
    .line(dashSeparator)
    .feed(3)
    .cut('partial');

  return encoder.encode();
};
