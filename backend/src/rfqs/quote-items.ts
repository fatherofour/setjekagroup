import { BadRequestException } from '@nestjs/common';
import { IsNumber, IsUUID, Min } from 'class-validator';
import type { PrismaService } from '../prisma/prisma.service.js';

export class QuoteItemRateDto {
  @IsUUID() rfqItemId!: string;
  @IsNumber() @Min(0) unitRate!: number;
}

/** An RFQ with priced items is quoted item by item: every item needs a
 * unit rate and the quote's price is their extended total. An RFQ without
 * items keeps the single lump-sum price. */
export async function resolveQuoteItems(prisma: PrismaService, rfqId: string, items: QuoteItemRateDto[] | undefined, price: number | undefined) {
  const rfqItems = await prisma.rfqItem.findMany({ where: { rfqId } });
  if (!rfqItems.length) {
    if (price == null) throw new BadRequestException('Enter the quoted price');
    return { price, rows: null as { rfqItemId: string; unitRate: number }[] | null };
  }
  const given = new Map((items ?? []).map((i) => [i.rfqItemId, i.unitRate]));
  if ([...given.keys()].some((id) => !rfqItems.some((r) => r.id === id))) throw new BadRequestException('A rate was given for an item that is not on this RFQ');
  const missing = rfqItems.filter((r) => !given.has(r.id));
  if (missing.length) throw new BadRequestException(`Give a unit rate for every item. Missing: ${missing.map((m) => m.description).join(', ')}`);
  const total = rfqItems.reduce((s, r) => s + r.quantity * given.get(r.id)!, 0);
  return {
    price: Math.round(total * 100) / 100,
    rows: rfqItems.map((r) => ({ rfqItemId: r.id, unitRate: given.get(r.id)! })),
  };
}
