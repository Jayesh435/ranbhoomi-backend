import polygonClipping
from "polygon-clipping";

/* AREA */

function polygonArea(
  coords: any[]
) {

  let area = 0;

  for (
    let i = 0;
    i < coords.length;
    i++
  ) {

    const j =
      (i + 1) %
      coords.length;

    area +=
      coords[i].longitude *
        coords[j].latitude -
      coords[j].longitude *
        coords[i].latitude;
  }

  return Math.abs(area / 2);
}

/* CONVERT */

function toPolygon(
  coords: any[]
): any {

  return [
    [
      coords.map((p) => [
        p.longitude,
        p.latitude,
      ]),
    ],
  ];
}

/* OVERLAP */

export function calculateOverlap(
  attacker: any[],
  defender: any[]
) {

  try {

    const intersection =
      polygonClipping.intersection(
        toPolygon(attacker) as any,
        toPolygon(defender) as any
      );

    if (
      !intersection ||
      intersection.length === 0
    ) {
      return 0;
    }

    const defenderArea =
      polygonArea(defender);

    if (defenderArea === 0) {
      return 0;
    }

    let overlapArea = 0;

    intersection.forEach(
      (poly: any) => {

        poly.forEach(
          (ring: any) => {

            const converted =
              ring.map(
                (p: any) => ({
                  longitude: p[0],
                  latitude: p[1],
                })
              );

            overlapArea +=
              polygonArea(
                converted
              );
          }
        );
      }
    );

    return (
      (overlapArea /
        defenderArea) *
      100
    );

  } catch (error) {

    console.log(
      "Battle overlap failed"
    );

    return 0;
  }
}