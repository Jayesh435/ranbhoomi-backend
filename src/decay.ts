import prisma from "./prisma";

export async function decayTerritories() {
  console.log("☠️ Running territory decay...");

  const territories = await prisma.territory.findMany();

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
      await prisma.territory.delete({
        where: {
          id: territory.id,
        },
      });

      console.log("💀 Territory destroyed");
    } else {
      await prisma.territory.update({
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
