import type { VehicleClass } from '@/types';

export interface VehicleClassMeta {
  key: VehicleClass;
  label: string;
  category: 'PASSENGER' | 'COMMERCIAL_GOODS' | 'CONSTRUCTION_HEAVY' | 'UTILITY_EMERGENCY' | 'SPECIALIZED_GOVT';
  categoryLabel: string;
  description: string;
  iconName: string;
  capacityDefault: number;
}

export const VEHICLE_CLASSIFICATIONS: VehicleClassMeta[] = [
  {
    key: 'CAR',
    label: 'Car / Official Sedan / SUV',
    category: 'PASSENGER',
    categoryLabel: 'Passenger Vehicles',
    description: 'Government staff cars, official sedans, and inspection SUVs',
    iconName: 'car',
    capacityDefault: 5
  },
  {
    key: 'PATROL_CAR',
    label: 'Police Patrol Cruiser',
    category: 'UTILITY_EMERGENCY',
    categoryLabel: 'Emergency & Enforcement',
    description: 'Police interception, patrol cruisers, and emergency response vehicles',
    iconName: 'police',
    capacityDefault: 4
  },
  {
    key: 'MOTORCYCLE',
    label: 'Motorcycle / Two-Wheeler',
    category: 'PASSENGER',
    categoryLabel: 'Two-Wheelers & Rapid Response',
    description: 'Police & enforcement motorcycles, traffic dispatch bikes, two-wheelers',
    iconName: 'motorcycle',
    capacityDefault: 2
  },
  {
    key: 'VAN',
    label: 'Van / Mobile Clinic',
    category: 'UTILITY_EMERGENCY',
    categoryLabel: 'Utility & Emergency',
    description: 'Utility vans, medical ambulances, health outreach and logistics vans',
    iconName: 'van',
    capacityDefault: 8
  },
  {
    key: 'CHHOTA_HATHI',
    label: 'Chhota Hathi / Mini Commercial Goods',
    category: 'COMMERCIAL_GOODS',
    categoryLabel: 'Commercial Goods Vehicles',
    description: 'Tata Ace, small commercial goods carriers, municipal delivery mini-trucks',
    iconName: 'chhotaHathi',
    capacityDefault: 2
  },
  {
    key: 'TRUCK',
    label: 'Truck / Heavy Commercial Vehicle',
    category: 'COMMERCIAL_GOODS',
    categoryLabel: 'Commercial Goods Vehicles',
    description: 'Medium and heavy goods trucks, tippers, transport carriers',
    iconName: 'truck',
    capacityDefault: 3
  },
  {
    key: 'BUS',
    label: 'Bus / Passenger Transport',
    category: 'PASSENGER',
    categoryLabel: 'Passenger Vehicles',
    description: 'Department buses, personnel transport coaches, mini-buses',
    iconName: 'bus',
    capacityDefault: 35
  },
  {
    key: 'JCB',
    label: 'JCB / Earthmoving & Construction Machinery',
    category: 'CONSTRUCTION_HEAVY',
    categoryLabel: 'Earthmoving & Machinery',
    description: 'JCBs, backhoe loaders, excavators, road construction & demolition machinery',
    iconName: 'jcb',
    capacityDefault: 1
  },
  {
    key: 'HEAVY',
    label: 'Heavy Commercial / Tipper',
    category: 'CONSTRUCTION_HEAVY',
    categoryLabel: 'Earthmoving & Machinery',
    description: 'Heavy municipal dumpers, tippers, road rollers and PWD heavy equipment',
    iconName: 'heavy',
    capacityDefault: 2
  },
  {
    key: 'SPECIALIZED',
    label: 'Specialized Government Machinery',
    category: 'SPECIALIZED_GOVT',
    categoryLabel: 'Specialized Government Machinery',
    description: 'Water tankers, fire tenders, cranes, sewer cleaning units and specialized machinery',
    iconName: 'specialized',
    capacityDefault: 2
  }
];

export const ALL_VEHICLE_CLASSES: VehicleClass[] = VEHICLE_CLASSIFICATIONS.map((c) => c.key);

export const VEHICLE_CLASS_MAP = new Map<VehicleClass, VehicleClassMeta>(
  VEHICLE_CLASSIFICATIONS.map((c) => [c.key, c])
);

export function getVehicleClassMeta(cls: VehicleClass | string): VehicleClassMeta {
  const norm = cls as VehicleClass;
  const match = VEHICLE_CLASS_MAP.get(norm);
  if (match) return match;
  // Fallbacks for legacy/varied tokens
  if (norm === 'HEAVY') return VEHICLE_CLASS_MAP.get('HEAVY')!;
  if (norm === 'VAN') return VEHICLE_CLASS_MAP.get('VAN')!;
  if (norm === 'MOTORCYCLE') return VEHICLE_CLASS_MAP.get('MOTORCYCLE')!;
  return VEHICLE_CLASS_MAP.get('CAR') ?? VEHICLE_CLASSIFICATIONS[0];
}

export function vehicleClassLabel(cls: VehicleClass | string): string {
  return getVehicleClassMeta(cls).label;
}

export function vehicleCategoryLabel(cls: VehicleClass | string): string {
  return getVehicleClassMeta(cls).categoryLabel;
}

export const VEHICLE_CLASS_OPTIONS = VEHICLE_CLASSIFICATIONS.map((c) => ({
  value: c.key,
  label: `${c.label} (${c.categoryLabel})`
}));

