/**
 * Curated photography catalog for Sanchay Civic Spaces.
 * Provides authentic, high-quality architectural images of government places,
 * administrative secretariats, town halls, collectorate buildings, auditoriums,
 * civic complexes, and government training academies from online.
 */

import type { SpaceCategory, SpaceView } from '@/types';

// Curated pool of verified high-resolution government and civic places from online
export const GOVERNMENT_PLACES_POOL: Record<string, string[]> = {
  // Government Secretariats, Municipal Corporations & Capitols
  SECRETARIAT_CIVIC: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Delhi_India_Government.jpg/1280px-Delhi_India_Government.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/Panorama_of_Secretariat_Building%2C_New_Delhi.jpg/1280px-Panorama_of_Secretariat_Building%2C_New_Delhi.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Ripon_Building_panorama.jpg/1280px-Ripon_Building_panorama.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/Main_Tower_of_Municipal_Corporation_Building%2C_Mumbai.jpg/1280px-Main_Tower_of_Municipal_Corporation_Building%2C_Mumbai.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Mumbai_-_Municipal_Corporation_Building.jpg/1280px-Mumbai_-_Municipal_Corporation_Building.jpg',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80'
  ],

  // District Collectorates, Administrative Blocks & Mini-Secretariats
  COLLECTORATE: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/District_Collectorate_of_West_Godavari_%28May_2019%29_3.jpg/1280px-District_Collectorate_of_West_Godavari_%28May_2019%29_3.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Calcutta_Collectorate_Building_in_BBD_Bag_01.jpg/1280px-Calcutta_Collectorate_Building_in_BBD_Bag_01.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Calcutta_Collectorate_Building_in_BBD_Bag_03.jpg/1280px-Calcutta_Collectorate_Building_in_BBD_Bag_03.jpg',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80'
  ],

  // Historic Town Halls & Civic Community Bhavans
  TOWN_HALL: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg/1280px-Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Ahmedabad_Town_Hall.jpg/1280px-Ahmedabad_Town_Hall.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Town_Hall_-Side_view.jpg/1280px-Town_Hall_-Side_view.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Town_Hall-_Front_View.jpg/1280px-Town_Hall-_Front_View.jpg',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80'
  ],

  // State Auditoriums & Civic Assembly Halls
  AUDITORIUM: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Gaston_hall.JPG/1280px-Gaston_hall.JPG',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80'
  ],

  // Municipal Corporation Council Chambers & Executive Boardrooms
  CONFERENCE_ROOM: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1505409859467-3a796fd5798e?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1200&q=80'
  ],

  // Government Training Academies, Classrooms & IT Laboratories
  TRAINING_HALL: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Government_School_in_New_Delhi.jpg/1280px-Government_School_in_New_Delhi.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg/1280px-Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80'
  ],

  // Health Department & District Hospital Infrastructure
  HEALTH_HOSPITAL: [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_05.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_05.jpg'
  ],

  // Record Depositories & Logistics Centers
  STORE: [
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80'
  ]
};

// Default high-reliability government building photo for fallbacks
export const DEFAULT_FALLBACK_PHOTO =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Ripon_Building_panorama.jpg/1280px-Ripon_Building_panorama.jpg';

// Distinct property mappings for all 27 spaces ensuring varied, realistic government photos
export const DISTINCT_PROPERTY_GOV_PHOTOS: Record<string, string[]> = {
  // GATC Sardar Patel Training Hall A
  'SCH-SP-GATC-01': [
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/Panorama_of_Secretariat_Building%2C_New_Delhi.jpg/1280px-Panorama_of_Secretariat_Building%2C_New_Delhi.jpg',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80'
  ],
  // GATC Atal Bihari Vajpayee Conference Room B
  'SCH-SP-GATC-02': [
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg',
    'https://images.unsplash.com/photo-1505409859467-3a796fd5798e?auto=format&fit=crop&w=1200&q=80'
  ],
  // GATC Vikramaditya State Auditorium
  'SCH-SP-GATC-03': [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Gaston_hall.JPG/1280px-Gaston_hall.JPG',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80'
  ],
  // GATC Kautilya Computer Lab
  'SCH-SP-GATC-04': [
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Delhi_India_Government.jpg/1280px-Delhi_India_Government.jpg'
  ],
  // GATC Seminar Hall C
  'SCH-SP-GATC-05': [
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
  ],
  // GATC Administrative Committee Lounge D
  'SCH-SP-GATC-06': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg',
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1200&q=80'
  ],
  // Govt Model HSS Saraswati Hall
  'SCH-SP-GMHSS-01': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Government_School_in_New_Delhi.jpg/1280px-Government_School_in_New_Delhi.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg/1280px-Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80'
  ],
  // Civil Hospital Conference Room 1
  'SCH-SP-0001': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg',
    'https://images.unsplash.com/photo-1505409859467-3a796fd5798e?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80'
  ],
  // Kamla Raja Hospital Rest Room B
  'SCH-SP-0002': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80'
  ],
  // Morar CHC Training Hall
  'SCH-SP-0003': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_05.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_05.jpg',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80'
  ],
  // Samudayik Bhavan A - Lashkar
  'SCH-SP-0004': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg/1280px-Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Town_Hall_-Side_view.jpg/1280px-Town_Hall_-Side_view.jpg'
  ],
  // Samudayik Bhavan B - Morar
  'SCH-SP-0005': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Ahmedabad_Town_Hall.jpg/1280px-Ahmedabad_Town_Hall.jpg',
    'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Town_Hall-_Front_View.jpg/1280px-Town_Hall-_Front_View.jpg'
  ],
  // Community Hall - Thatipur
  'SCH-SP-0006': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Town_Hall_-Side_view.jpg/1280px-Town_Hall_-Side_view.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg/1280px-Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80'
  ],
  // Samudayik Bhavan - Gola Ka Mandir
  'SCH-SP-0007': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Town_Hall-_Front_View.jpg/1280px-Town_Hall-_Front_View.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Ahmedabad_Town_Hall.jpg/1280px-Ahmedabad_Town_Hall.jpg',
    'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80'
  ],
  // Classroom Block A - Govt School Lashkar
  'SCH-SP-0008': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Government_School_in_New_Delhi.jpg/1280px-Government_School_in_New_Delhi.jpg',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80'
  ],
  // Computer Lab - Govt School Morar
  'SCH-SP-0009': [
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg/1280px-Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80'
  ],
  // Training Room - NIC Gwalior
  'SCH-SP-0010': [
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Delhi_India_Government.jpg/1280px-Delhi_India_Government.jpg',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80'
  ],
  // Meeting Room 1 - PWD Office Lashkar
  'SCH-SP-0011': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Calcutta_Collectorate_Building_in_BBD_Bag_01.jpg/1280px-Calcutta_Collectorate_Building_in_BBD_Bag_01.jpg',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1505409859467-3a796fd5798e?auto=format&fit=crop&w=1200&q=80'
  ],
  // Conference Hall - Collector Office
  'SCH-SP-0012': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/District_Collectorate_of_West_Godavari_%28May_2019%29_3.jpg/1280px-District_Collectorate_of_West_Godavari_%28May_2019%29_3.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2894962%29.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Ripon_Building_panorama.jpg/1280px-Ripon_Building_panorama.jpg',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80'
  ],
  // Transit Room 1 - Lashkar PS
  'SCH-SP-0013': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/Main_Tower_of_Municipal_Corporation_Building%2C_Mumbai.jpg/1280px-Main_Tower_of_Municipal_Corporation_Building%2C_Mumbai.jpg',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80'
  ],
  // Transit Room 2 - Morar PS
  'SCH-SP-0014': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Mumbai_-_Municipal_Corporation_Building.jpg/1280px-Mumbai_-_Municipal_Corporation_Building.jpg',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80'
  ],
  // Community Hall - Fort Road
  'SCH-SP-0015': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Ahmedabad_Town_Hall.jpg/1280px-Ahmedabad_Town_Hall.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg/1280px-Sir_Puttanna_Chetty_Town_Hall_Bangalore_Edit1.jpg',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80'
  ],
  // Training Hall - Smart City Center
  'SCH-SP-0016': [
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Delhi_India_Government.jpg/1280px-Delhi_India_Government.jpg',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80'
  ],
  // Classroom Block C - Govt School Thatipur
  'SCH-SP-0017': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg/1280px-Government_High_School_Adoor%2C_Kerala%2C_India_old_building.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Government_School_in_New_Delhi.jpg/1280px-Government_School_in_New_Delhi.jpg',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80'
  ],
  // Ward Training Space - District Hospital
  'SCH-SP-0018': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_01.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg/1280px-P.G._%28SSKM%29_Hospital%2C_administrative_building_and_campus_02.jpg',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80'
  ],
  // PWD Review Room - Morar
  'SCH-SP-0019': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Calcutta_Collectorate_Building_in_BBD_Bag_03.jpg/1280px-Calcutta_Collectorate_Building_in_BBD_Bag_03.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg/1280px-Interior_of_Municipal_Corporation_Building%2C_Mumbai_%2867705%29.jpg',
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80'
  ],
  // Urban Training Hall - East Circle
  'SCH-SP-0020': [
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Ripon_Building_panorama.jpg/1280px-Ripon_Building_panorama.jpg',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80'
  ]
};

/**
 * Returns a stable hash integer from a string identifier.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generates a pseudo-random, varied selection of government place images for a given category.
 */
export function getRandomGovPhotos(seed: string, category: SpaceCategory = 'OTHER', count = 3): string[] {
  let poolKey = 'SECRETARIAT_CIVIC';
  switch (category) {
    case 'TRAINING_HALL':
      poolKey = 'TRAINING_HALL';
      break;
    case 'MEETING_ROOM':
      poolKey = 'CONFERENCE_ROOM';
      break;
    case 'AUDITORIUM':
      poolKey = 'AUDITORIUM';
      break;
    case 'COMMUNITY_HALL':
      poolKey = 'TOWN_HALL';
      break;
    case 'OFFICE':
      poolKey = 'COLLECTORATE';
      break;
    case 'STORE':
      poolKey = 'STORE';
      break;
    default:
      poolKey = 'SECRETARIAT_CIVIC';
  }

  const pool = GOVERNMENT_PLACES_POOL[poolKey] || GOVERNMENT_PLACES_POOL.SECRETARIAT_CIVIC;
  const hash = hashString(seed || 'civic-space');
  const results: string[] = [];

  for (let i = 0; i < count; i++) {
    const idx = (hash + i) % pool.length;
    results.push(pool[idx]);
  }

  return results;
}

/**
 * Returns an array of authentic, verified government places photo URLs for a given space.
 * Prioritizes database photos, then custom property mappings, then random government pool.
 */
export function getSpacePhotos(space: Partial<SpaceView> & { assetCode?: string; category?: string; photos?: string[] | null }): string[] {
  if (Array.isArray(space.photos) && space.photos.length > 0) {
    return space.photos;
  }
  if (space.assetCode && DISTINCT_PROPERTY_GOV_PHOTOS[space.assetCode]) {
    return DISTINCT_PROPERTY_GOV_PHOTOS[space.assetCode];
  }
  return getRandomGovPhotos(space.assetCode || space.name || 'civic-place', (space.category as SpaceCategory) || 'OTHER');
}

/**
 * Returns the primary (hero) photograph URL for card and header displays.
 */
export function getSpaceHeroPhoto(space: Partial<SpaceView> & { assetCode?: string; category?: string; photos?: string[] | null }): string {
  const photos = getSpacePhotos(space);
  return photos[0] || DEFAULT_FALLBACK_PHOTO;
}
