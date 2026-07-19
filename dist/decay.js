"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decayTerritories = decayTerritories;
const prisma_1 = __importDefault(require("./prisma"));
async function decayTerritories() {
    console.log("☠️ Running territory decay...");
    const territories = await prisma_1.default.territory.findMany();
    const now = new Date().getTime();
    const decayPerHour = 100 / (7 * 24);
    for (const territory of territories) {
        const lastActive = new Date(territory.lastActive).getTime();
        const hoursInactive = (now - lastActive) / (1000 * 60 * 60);
        /* DECAY RATE */
        const decay = hoursInactive * decayPerHour;
        const newHealth = territory.health - decay;
        /* DESTROY DEAD TERRITORIES */
        if (newHealth <= 0) {
            await prisma_1.default.territory.delete({
                where: {
                    id: territory.id,
                },
            });
            console.log("💀 Territory destroyed");
        }
        else {
            await prisma_1.default.territory.update({
                where: {
                    id: territory.id,
                },
                data: {
                    health: newHealth,
                },
            });
            console.log("Territory decayed", territory.id);
        }
    }
}
