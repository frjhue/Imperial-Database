const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const session = require("express-session")
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "frontend")));

const pool = new Pool({
 user: "postgres",
 host: "localhost",
 database: "internal_db",
 password: "",
 port: 5432
});
app.use(session({
 secret: "imperial_secret_key",
 resave: false,
 saveUninitialized: false
}));

app.get("/health", (req, res) => {
 res.send("Imperial system online");
});

app.post("/login", async (req, res) => {
 const { callsign, password } = req.body;

 try {
  const result = await pool.query(
   "SELECT * FROM imperial_personnel WHERE callsign = $1",
    [callsign]
   );

  if (result.rows.length === 0) {
    return res.status(401).send("Invalid callsign");
  }
  
  const user = result.rows[0]

  const match = await bcrypt.compare(password, user.password_hash);  

  if (!match) {
    return res.status(401).send("Invalid callsign");
  }

  req.session.user = {
   id: user.id,
   callsign: user.callsign,
   clearance: user.clearance_level
  },

  
  res.json({
   message: "Login successful",
   redirect: "/dashboard"
  });

  } catch (err) {
   console.log(err);
   res.status(500).send("Server error"); 
  }
});

app.get("/dashboard", (req, res) => {
 if (!req.session.user) {
  return res.status(401).send("ACCESS DENIED");
 }

 res.sendFile(__dirname + "/frontend/dashboard.html");
});

app.post("/register", async (req, res) => {
 const { callsign, password } = req.body;

 try {
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.query(
   "INSERT INTO imperial_personnel (callsign, password_hash) VALUES ($1, $2)",
   [callsign, hashedPassword]
  );

  res.send("User registered");
 } catch (err) {
   console.log(err);
   res.status(500).send("Error registering user");
 }
});


app.listen(3000, "0.0.0.0", () => {
 console.log("Imperial server running on port 3000");
});
