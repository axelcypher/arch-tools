/** Treffer eines Klicks in der 3D-Ansicht (Ausschnitt aus THREE.Intersection) */
export interface Treffer3d {
  object: { userData: { shapeId?: string; raum?: boolean } };
}

/**
 * Welcher Treffer gewählt wird: Raumflächen liegen innerhalb der BRI-Körper, der Strahl trifft also zuerst Deck- oder
 * Seitenfläche des Körpers. Ein getroffener Raum geht deshalb vor; sonst der vorderste Treffer.
 */
export function trefferWaehlen<T extends Treffer3d>(treffer: readonly T[]): T | undefined {
  return treffer.find((t) => t.object.userData.raum && t.object.userData.shapeId) ?? treffer.find((t) => t.object.userData.shapeId);
}
