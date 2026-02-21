import { UUID, EntityType, Percentage } from "./types";

export interface Entity {
  id: UUID;
  name: string;
  type: EntityType; // 'EXPLOITATION' | 'SCI'

  // Paramètres financiers structurants
  corporateTaxRate: Percentage; // ex: { value: 0.25 } pour 25%
  minimumCashBuffer: number; // trésorerie minimale obligatoire en euros
  distributionAllowed: boolean; // autorise ou non la distribution

  createdAt: Date;
  updatedAt: Date;
}
