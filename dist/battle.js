"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOverlap = calculateOverlap;
const polygon_clipping_1 = __importDefault(require("polygon-clipping"));
/* AREA */
function polygonArea(coords) {
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) %
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
function toPolygon(coords) {
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
function calculateOverlap(attacker, defender) {
    try {
        const intersection = polygon_clipping_1.default.intersection(toPolygon(attacker), toPolygon(defender));
        if (!intersection ||
            intersection.length === 0) {
            return 0;
        }
        const defenderArea = polygonArea(defender);
        if (defenderArea === 0) {
            return 0;
        }
        let overlapArea = 0;
        intersection.forEach((poly) => {
            poly.forEach((ring) => {
                const converted = ring.map((p) => ({
                    longitude: p[0],
                    latitude: p[1],
                }));
                overlapArea +=
                    polygonArea(converted);
            });
        });
        return ((overlapArea /
            defenderArea) *
            100);
    }
    catch (error) {
        console.log("Battle overlap failed");
        return 0;
    }
}
