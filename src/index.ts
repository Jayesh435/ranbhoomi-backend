import bcrypt from "bcryptjs";

import jwt from "jsonwebtoken";

import cors from "cors";
import express from "express";

import prisma from "./prisma";

import { calculateOverlap } from "./battle";

import { decayTerritories } from "./decay";

import { createServer } from "http";

import { Server } from "socket.io";

const app = express();

const server = createServer(app);

const io =
  new Server(

    server,

    {

      cors: {

        origin: "*",
      },
    }
  );

app.use(cors());

app.use(express.json());

/* SOCKET CONNECTION */
let livePlayers: any[] = [];

io.on(
  "connection",

  (socket) => {
    console.log("Socket connected");

    /* PLAYER MOVE */

    socket.on(
      "player_move",

      (playerData) => {
        const index = livePlayers.findIndex(
          (p) => p.id ===
                    playerData.id,
        );

        if (index !== -1) {
          livePlayers[index] = playerData;
        } else {
          livePlayers.push(playerData);
        }

        io.emit(
          "players_update",

          livePlayers,
        );
      },
    );

    /* DISCONNECT */

    socket.on(
      "disconnect",

      () => {
        console.log("Socket disconnected");
      },
    );
  },
);

/* DECAY SYSTEM */

setInterval(
  async () => {
    try {
      await decayTerritories();
    } catch (error) {
      console.log(error);
    }
  },
  1000 * 60 * 10,
);

/* ROOT */

app.get(
  "/",

  async (req, res) => {
    res.json({
      status: "RunBhoomi backend running",
    });
  },
);

/* SIGNUP */

app.post(
  "/signup",

  async (req, res) => {
    try {
      const { username, password, faction } = req.body;

      const existing = await prisma.user.findUnique({
        where: {
          username,
        },
      });

      if (existing) {
        return res.status(400).json({
          error: "Username already exists",
        });
      }

      const hashed = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,

          password: hashed,

          faction,

          xp: 0,
        },
      });

      const token = jwt.sign(
        {
          userId: user.id,
        },

        process.env.JWT_SECRET as string,
      );

      res.json({
        token,

        user,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Signup failed",
      });
    }
  },
);

/* LOGIN */

app.post(
  "/login",

  async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await prisma.user.findUnique({
        where: {
          username,
        },
      });

      if (!user) {
        return res.status(400).json({
          error: "Invalid credentials",
        });
      }

      const valid = await bcrypt.compare(
        password,

        user.password,
      );

      if (!valid) {
        return res.status(400).json({
          error: "Invalid credentials",
        });
      }

      const token = jwt.sign(
        {
          userId: user.id,
        },

        process.env.JWT_SECRET as string,
      );

      res.json({
        token,

        user,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Login failed",
      });
    }
  },
);

/* GET TERRITORIES */

app.get(
  "/territories",

  async (req, res) => {
    try {
      const territories = await prisma.territory.findMany({
        include: {
          user: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(territories);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Failed to fetch territories",
      });
    }
  },
);

/* SAVE TERRITORY + BATTLE */

app.post(
  "/territories",

  async (req, res) => {
    try {
      const { userId, chakra, coordinates } = req.body;

      if (!coordinates || coordinates.length < 3) {
        return res.status(400).json({
          error: "Invalid polygon",
        });
      }

      /* AUTO AREA CALCULATION */

      const area =
        Math.abs(
          coordinates.reduce(
            (sum: number, point: any, index: number, arr: any[]) => {
              const next = arr[(index + 1) % arr.length];

              return (
                sum +
                (point.latitude * next.longitude -
                  next.latitude * point.longitude)
              );
            },

            0,
          ) / 2,
        ) * 10000000000;

      const territories = await prisma.territory.findMany({
        include: {
          user: true,
        },
      });

      let battle = false;

      let conquered = false;

      for (const territory of territories) {
        /* SKIP OWN TERRITORY */

        if (territory.userId === userId) {
          continue;
        }

        const overlap = calculateOverlap(
          coordinates,
          territory.coordinates as any[],
        );

        console.log("OVERLAP", overlap);

        /* ATTACK */

        if (overlap > 10) {
          battle = true;

          io.emit("territory_battle", {
            territoryId: territory.id,
          });

          const newHealth = territory.health - overlap;

          /* DESTROY */

          if (newHealth <= 0) {
            conquered = true;

            await prisma.territory.delete({
              where: {
                id: territory.id,
              },
            });
          } else {
            await prisma.territory.update({
              where: {
                id: territory.id,
              },

              data: {
                health: newHealth,
              },
            });
          }
        }
      }

      /* CREATE NEW TERRITORY */

      const created = await prisma.territory.create({
        data: {
          userId,

          area,

          chakra,

          coordinates,

          health: 100,

          lastActive: new Date(),
        },
      });
      /* XP REWARD SYSTEM */

      let xpReward = Math.round(area / 100);

      if (battle) {
        xpReward += 50;
      }

      if (conquered) {
        xpReward += 100;
      }

      await prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          xp: {
            increment: xpReward,
          },
        },
      });
      /* LIVE UPDATES */

      io.emit("territory_created");

      const updatedUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (battle) {
        io.emit("territory_battle");
      }

      res.json({
        territory: created,

        battle,

        conquered,

        xpReward,

        totalXp: updatedUser?.xp || 0,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Battle system failed",
      });
    }
  },
);

/* PROFILE */

app.get(
  "/profile/:userId",

  async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },

        include: {
          territories: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      const totalArea = user.territories.reduce(
        (sum, territory) => sum + territory.area,

        0,
      );

      res.json({
        id: user.id,

        username: user.username,

        faction: user.faction,

        xp: user.xp,

        territoryCount: user.territories.length,

        totalArea,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Failed to load profile",
      });
    }
  },
);

/* DAILY MISSIONS */

app.get(
  "/missions",

  async (req, res) => {
    res.json([
      {
        id: 1,

        title: "Capture 2 Territories",

        progress: 1,

        goal: 2,

        xp: 120,
      },

      {
        id: 2,

        title: "Run 2 KM",

        progress: 1.4,

        goal: 2,

        xp: 80,
      },

      {
        id: 3,

        title: "Win 1 Battle",

        progress: 0,

        goal: 1,

        xp: 150,
      },
    ]);
  },
);

/* LEADERBOARD */

app.get(
  "/leaderboard",

  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          territories: true,
        },
      });

      const leaderboard = users.map((user) => {
        const totalArea = user.territories.reduce(
          (sum, territory) => sum + territory.area,

          0,
        );

        return {
          id: user.id,

          username: user.username,

          faction: user.faction,

          xp: user.xp,

          territories: user.territories.length,

          totalArea: Math.floor(totalArea),
        };
      });

      leaderboard.sort((a, b) => b.xp - a.xp);

      res.json(leaderboard);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: "Failed to load leaderboard",
      });
    }
  },
);

/* SERVER */

const PORT = 4000;

server.listen(
  PORT,

  () => {
    console.log(`Server running on ${PORT}`);
  },
);
