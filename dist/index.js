"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("./prisma"));
const battle_1 = require("./battle");
const decay_1 = require("./decay");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
app.use((0, cors_1.default)({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));
app.use(express_1.default.json());
/* SOCKET CONNECTION */
let livePlayers = [];
io.on("connection", (socket) => {
    console.log("Socket connected");
    /* PLAYER MOVE */
    socket.on("player_move", (playerData) => {
        const index = livePlayers.findIndex((p) => p.id === playerData.id);
        if (index !== -1) {
            livePlayers[index] = playerData;
        }
        else {
            livePlayers.push(playerData);
        }
        io.emit("players_update", livePlayers);
    });
    /* DISCONNECT */
    socket.on("disconnect", () => {
        console.log("Socket disconnected");
    });
});
/* DECAY SYSTEM */
setInterval(async () => {
    try {
        await (0, decay_1.decayTerritories)();
    }
    catch (error) {
        console.log(error);
    }
}, 1000 * 60 * 10);
/* ROOT */
app.get("/", async (req, res) => {
    res.json({
        status: "RunBhoomi backend running",
    });
});
/* SIGNUP */
app.post("/signup", async (req, res) => {
    try {
        const { username, password, faction } = req.body;
        const existing = await prisma_1.default.user.findUnique({
            where: {
                username,
            },
        });
        if (existing) {
            return res.status(400).json({
                error: "Username already exists",
            });
        }
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_1.default.user.create({
            data: {
                username,
                password: hashed,
                faction,
                xp: 0,
            },
        });
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
        }, process.env.JWT_SECRET);
        res.json({
            token,
            user,
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Signup failed",
        });
    }
});
/* LOGIN */
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await prisma_1.default.user.findUnique({
            where: {
                username,
            },
        });
        if (!user) {
            return res.status(400).json({
                error: "Invalid credentials",
            });
        }
        const valid = await bcryptjs_1.default.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({
                error: "Invalid credentials",
            });
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
        }, process.env.JWT_SECRET);
        res.json({
            token,
            user,
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Login failed",
        });
    }
});
/* GET TERRITORIES */
app.get("/territories", async (req, res) => {
    try {
        const territories = await prisma_1.default.territory.findMany({
            include: {
                user: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        res.json(territories);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Failed to fetch territories",
        });
    }
});
/* SAVE TERRITORY + BATTLE */
app.post("/territories", async (req, res) => {
    try {
        const { userId, chakra, coordinates } = req.body;
        if (!coordinates || coordinates.length < 3) {
            return res.status(400).json({
                error: "Invalid polygon",
            });
        }
        /* AUTO AREA CALCULATION */
        const area = Math.abs(coordinates.reduce((sum, point, index, arr) => {
            const next = arr[(index + 1) % arr.length];
            return (sum +
                (point.latitude * next.longitude -
                    next.latitude * point.longitude));
        }, 0) / 2) * 10000000000;
        const territories = await prisma_1.default.territory.findMany({
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
            const overlap = (0, battle_1.calculateOverlap)(coordinates, territory.coordinates);
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
                    await prisma_1.default.territory.delete({
                        where: {
                            id: territory.id,
                        },
                    });
                }
                else {
                    await prisma_1.default.territory.update({
                        where: {
                            id: territory.id,
                        },
                        data: {
                            health: newHealth,
                            lastActive: new Date(),
                        },
                    });
                }
            }
        }
        /* CREATE NEW TERRITORY */
        const created = await prisma_1.default.territory.create({
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
        await prisma_1.default.user.update({
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
        const updatedUser = await prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Battle system failed",
        });
    }
});
/* PROFILE */
app.get("/profile/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await prisma_1.default.user.findUnique({
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
        const totalArea = user.territories.reduce((sum, territory) => sum + territory.area, 0);
        res.json({
            id: user.id,
            username: user.username,
            faction: user.faction,
            xp: user.xp,
            territoryCount: user.territories.length,
            totalArea,
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Failed to load profile",
        });
    }
});
/* DAILY MISSIONS */
app.get("/missions", async (req, res) => {
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
});
/* LEADERBOARD */
app.get("/leaderboard", async (req, res) => {
    try {
        const users = await prisma_1.default.user.findMany({
            include: {
                territories: true,
            },
        });
        const leaderboard = users.map((user) => {
            const totalArea = user.territories.reduce((sum, territory) => sum + territory.area, 0);
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
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Failed to load leaderboard",
        });
    }
});
/* SERVER */
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
