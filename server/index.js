import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "homebuild-dev-secret-change-in-production";

const db = new Database(process.env.DB_FILE || "homebuild.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

app.use(cors());
app.use(express.json({ limit: "8mb" }));

/* =========================================================
   DATABASE
========================================================= */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  experience_years INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  portfolio TEXT DEFAULT '',
  approval_status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  service_type TEXT DEFAULT 'New House Purchase / Construction',
  title TEXT NOT NULL,
  name TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  city TEXT NOT NULL,
  plot_size TEXT DEFAULT '',
  area_sqft INTEGER DEFAULT 0,
  plot_location TEXT DEFAULT '',
  floors TEXT DEFAULT '',
  bhk TEXT DEFAULT '',
  budget TEXT DEFAULT '',
  details TEXT DEFAULT '',
  attachments TEXT DEFAULT '[]',
  expected_start TEXT DEFAULT '',
  status TEXT DEFAULT 'New Request',
  assigned_professional_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS requirement_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  status TEXT DEFAULT 'assigned',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(requirement_id, professional_id),
  FOREIGN KEY(requirement_id) REFERENCES requirements(id),
  FOREIGN KEY(professional_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  design_charges REAL DEFAULT 0,
  plan_2d_charges REAL DEFAULT 0,
  plan_3d_charges REAL DEFAULT 0,
  elevation_charges REAL DEFAULT 0,
  structural_charges REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  revisions INTEGER DEFAULT 0,
  delivery_days INTEGER DEFAULT 0,
  services_included TEXT DEFAULT '',
  gst REAL DEFAULT 0,
  terms TEXT DEFAULT '',
  status TEXT DEFAULT 'Submitted',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(requirement_id) REFERENCES requirements(id),
  FOREIGN KEY(professional_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL,
  quotation_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  status TEXT DEFAULT 'Quotation Selected',
  payment_status TEXT DEFAULT 'Pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(requirement_id) REFERENCES requirements(id),
  FOREIGN KEY(quotation_id) REFERENCES quotations(id),
  FOREIGN KEY(customer_id) REFERENCES users(id),
  FOREIGN KEY(professional_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  requirement_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  status TEXT DEFAULT 'Booking Confirmed',
  progress INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL DEFAULT 0,
  unit TEXT DEFAULT 'piece',
  stock INTEGER DEFAULT 0,
  city TEXT DEFAULT 'Bhopal',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  city TEXT DEFAULT '',
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'New Request',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_request_id INTEGER NOT NULL,
  material_name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  FOREIGN KEY(material_request_id) REFERENCES material_requests(id)
);

CREATE TABLE IF NOT EXISTS material_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  vendor_id INTEGER,
  material_request_id INTEGER,
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  payment_status TEXT DEFAULT 'Pending',
  delivery_status TEXT DEFAULT 'Pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  requirement_id INTEGER,
  name TEXT NOT NULL,
  file_type TEXT DEFAULT '',
  file_data TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  booking_id INTEGER,
  amount REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  payment_method TEXT DEFAULT '',
  transaction_id TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL,
  booking_id INTEGER,
  rating INTEGER DEFAULT 5,
  review TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  professional_id INTEGER,
  booking_id INTEGER,
  subject TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'Open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

/* =========================================================
   HELPERS
========================================================= */

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    city: user.city || "",
    bio: user.bio || "",
    experience_years: user.experience_years || 0,
    rating: user.rating || 0,
    review_count: user.review_count || 0,
    portfolio: user.portfolio || "",
    approval_status: user.approval_status || "approved",
  };
}

function issueToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    const token = header.substring(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function makeCode(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/* =========================================================
   DEMO USERS
   These are ONLY for testing.
========================================================= */

function createDemoUser(
  name,
  email,
  password,
  role,
  phone,
  city,
  approval_status = "approved"
) {
  const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email.toLowerCase());

  if (exists) return;

  const password_hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users
    (name,email,password_hash,role,phone,city,approval_status)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    name,
    email.toLowerCase(),
    password_hash,
    role,
    phone,
    city,
    approval_status
  );
}

createDemoUser(
  "Demo Customer",
  "customer@homebuild.test",
  "password123",
  "customer",
  "9999999999",
  "Bhopal"
);

createDemoUser(
  "Demo Architect",
  "architect@homebuild.test",
  "password123",
  "architect",
  "9999999998",
  "Bhopal"
);

createDemoUser(
  "Demo Vendor",
  "vendor@homebuild.test",
  "password123",
  "vendor",
  "9999999997",
  "Bhopal"
);

createDemoUser(
  "HomeBuild Admin",
  "admin@homebuild.test",
  "password123",
  "admin",
  "9999999996",
  "Bhopal"
);

/* =========================================================
   DEMO MATERIALS
========================================================= */

const materialCount = db
  .prepare("SELECT COUNT(*) AS count FROM materials")
  .get().count;

if (materialCount === 0) {
  const vendor = db
    .prepare("SELECT id FROM users WHERE role='vendor' LIMIT 1")
    .get();

  const materials = [
    ["Cement", "UltraTech Cement", 420, "bag", 500, "Bhopal"],
    ["Sand", "River Sand", 55, "cft", 1000, "Bhopal"],
    ["Gitti", "20mm Gitti", 48, "cft", 800, "Bhopal"],
    ["Bricks", "Red Clay Bricks", 9, "piece", 10000, "Bhopal"],
    ["Steel", "TMT Steel", 68, "kg", 5000, "Bhopal"],
    ["TMT Bars", "TMT 12mm Bar", 690, "piece", 1000, "Bhopal"],
    ["Tiles", "Premium Floor Tiles", 65, "sq.ft", 3000, "Bhopal"],
    ["Marble", "White Marble", 180, "sq.ft", 1500, "Bhopal"],
    ["Granite", "Black Granite", 150, "sq.ft", 1200, "Bhopal"],
    ["Plumbing", "CPVC Plumbing Set", 2500, "set", 100, "Bhopal"],
    ["Electrical", "Electrical Wiring Pack", 5200, "set", 80, "Bhopal"],
    ["Paint", "Interior Paint", 3800, "bucket", 150, "Bhopal"],
    ["Doors", "Main Door", 18500, "piece", 30, "Bhopal"],
    ["Windows", "UPVC Window", 8500, "piece", 60, "Bhopal"],
    ["Hardware", "Hardware Combo", 5200, "set", 80, "Bhopal"],
    ["Sanitary", "Sanitary Bathroom Set", 12500, "set", 50, "Bhopal"],
    ["Kitchen Material", "Modular Kitchen Basic", 125000, "set", 12, "Bhopal"],
  ];

  const insert = db.prepare(`
    INSERT INTO materials
    (vendor_id,category,name,price,unit,stock,city)
    VALUES (?,?,?,?,?,?,?)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(vendor?.id || null, ...row);
    }
  });

  insertMany(materials);
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "HomeBuild API",
    database: "SQLite",
  });
});

/* =========================================================
   AUTH - REGISTER
========================================================= */

app.post("/api/auth/register", (req, res) => {
  const {
    name = "",
    email = "",
    password = "",
    role = "customer",
    phone = "",
    mobile = "",
    city = "",
  } = req.body || {};

  if (!name.trim() || !email.trim() || !password) {
    return res.status(400).json({
      message: "Name, email and password are required",
    });
  }

  const allowedRoles = ["customer", "architect", "vendor"];

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({
      message: "Invalid role",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (exists) {
    return res.status(409).json({
      message: "An account with this email already exists",
    });
  }

  /*
    Customers are approved immediately.
    Architects/Vendors are pending so Admin can approve them.
  */

  const approval_status = role === "customer" ? "approved" : "pending";

  const password_hash = bcrypt.hashSync(password, 10);

  const info = db
    .prepare(`
      INSERT INTO users
      (name,email,password_hash,role,phone,city,approval_status)
      VALUES (?,?,?,?,?,?,?)
    `)
    .run(
      name.trim(),
      normalizedEmail,
      password_hash,
      role,
      phone || mobile || "",
      city || "",
      approval_status
    );

  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(info.lastInsertRowid);

  /*
    Professional accounts remain pending.
    They can login but access can be restricted until approval.
  */

  const token = issueToken(user);

  return res.status(201).json({
    token,
    user: safeUser(user),
    message:
      role === "customer"
        ? "Account created successfully"
        : "Account created. Admin approval is required.",
  });
});

/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post("/api/auth/login", (req, res) => {
  const { email = "", password = "" } = req.body || {};

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(String(email).trim().toLowerCase());

  if (!user) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  if (
    (user.role === "architect" || user.role === "vendor") &&
    user.approval_status !== "approved"
  ) {
    return res.status(403).json({
      message: "Your professional account is waiting for Admin approval.",
    });
  }

  const token = issueToken(user);

  res.json({
    token,
    user: safeUser(user),
  });
});

/* =========================================================
   REQUIREMENTS
========================================================= */

app.post("/api/requirements", auth, (req, res) => {
  const {
    service_type = "New House Purchase / Construction",
    title = "New House Construction",
    name = "",
    mobile = "",
    phone = "",
    city = "",
    plot_size = "",
    area_sqft = 0,
    plot_location = "",
    floors = "",
    bhk = "",
    budget = "",
    details = "",
    attachments = [],
    expected_start = "",
  } = req.body || {};

  if (!city.trim()) {
    return res.status(400).json({
      message: "City / Location is required",
    });
  }

  const request_id = makeCode("REQ");

  const info = db
    .prepare(`
      INSERT INTO requirements
      (
        request_id,
        user_id,
        service_type,
        title,
        name,
        mobile,
        city,
        plot_size,
        area_sqft,
        plot_location,
        floors,
        bhk,
        budget,
        details,
        attachments,
        expected_start,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .run(
      request_id,
      req.user.id,
      service_type,
      title,
      name || "",
      mobile || phone || "",
      city,
      plot_size || "",
      Number(area_sqft || 0),
      plot_location || "",
      floors || "",
      bhk || "",
      budget || "",
      details || "",
      JSON.stringify(attachments || []),
      expected_start || "",
      "New Request"
    );

  const requirement = db
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(info.lastInsertRowid);

  res.status(201).json({
    message: "Requirement submitted successfully",
    requirement,
  });
});

app.get("/api/requirements", auth, (req, res) => {
  let rows;

  if (req.user.role === "admin") {
    rows = db.prepare(`
      SELECT
        r.*,
        u.email AS customer_email,
        u.name AS customer_name,
        p.name AS assigned_professional_name,
        p.role AS assigned_professional_role
      FROM requirements r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN users p ON p.id = r.assigned_professional_id
      ORDER BY r.id DESC
    `).all();
  } else if (
    req.user.role === "architect" ||
    req.user.role === "vendor"
  ) {
    rows = db.prepare(`
      SELECT
        r.*,
        u.name AS customer_name,
        u.email AS customer_email
      FROM requirements r
      LEFT JOIN users u ON u.id = r.user_id
      INNER JOIN requirement_assignments ra
        ON ra.requirement_id = r.id
      WHERE ra.professional_id = ?
      ORDER BY r.id DESC
    `).all(req.user.id);
  } else {
    rows = db.prepare(`
      SELECT
        r.*,
        u.name AS customer_name,
        u.email AS customer_email,
        p.name AS assigned_professional_name
      FROM requirements r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN users p ON p.id = r.assigned_professional_id
      WHERE r.user_id = ?
      ORDER BY r.id DESC
    `).all(req.user.id);
  }

  res.json({
    requirements: rows,
  });
});

/* =========================================================
   ADMIN - PROFESSIONALS
========================================================= */

app.get("/api/professionals", auth, (req, res) => {
  const role = req.query.role;

  let rows;

  if (role) {
    rows = db
      .prepare(`
        SELECT
          id,name,email,role,phone,city,bio,
          experience_years,rating,review_count,
          portfolio,approval_status
        FROM users
        WHERE role = ?
        ORDER BY rating DESC, id DESC
      `)
      .all(role);
  } else {
    rows = db
      .prepare(`
        SELECT
          id,name,email,role,phone,city,bio,
          experience_years,rating,review_count,
          portfolio,approval_status
        FROM users
        WHERE role IN ('architect','vendor')
        ORDER BY rating DESC, id DESC
      `)
      .all();
  }

  res.json({
    professionals: rows,
  });
});

/* =========================================================
   ADMIN - USERS
========================================================= */

app.get("/api/admin/users", auth, adminOnly, (req, res) => {
  const users = db
    .prepare(`
      SELECT
        id,name,email,role,phone,city,
        experience_years,rating,review_count,
        portfolio,approval_status,created_at
      FROM users
      ORDER BY id DESC
    `)
    .all();

  res.json({ users });
});

/* =========================================================
   ADMIN - STATS
========================================================= */

app.get("/api/admin/stats", auth, adminOnly, (req, res) => {
  const count = (table) =>
    db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

  res.json({
    stats: {
      users: count("users"),
      customers: db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role='customer'")
        .get().count,
      professionals: db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role IN ('architect','vendor')"
        )
        .get().count,
      requirements: count("requirements"),
      quotations: count("quotations"),
      bookings: count("bookings"),
      materialOrders: count("material_orders"),
      disputes: count("disputes"),
      commission: 0,
    },
  });
});

/* =========================================================
   ADMIN - ASSIGN REQUIREMENT
========================================================= */

app.post(
  "/api/requirements/:id/assign",
  auth,
  adminOnly,
  (req, res) => {
    const requirementId = Number(req.params.id);
    const professionalId = Number(req.body.professional_id);

    const requirement = db
      .prepare("SELECT * FROM requirements WHERE id = ?")
      .get(requirementId);

    if (!requirement) {
      return res.status(404).json({
        message: "Requirement not found",
      });
    }

    const professional = db
      .prepare(`
        SELECT *
        FROM users
        WHERE id = ?
          AND role IN ('architect','vendor')
      `)
      .get(professionalId);

    if (!professional) {
      return res.status(404).json({
        message: "Professional not found",
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO requirement_assignments
      (requirement_id,professional_id,status)
      VALUES (?,?,?)
    `).run(requirementId, professionalId, "assigned");

    db.prepare(`
      UPDATE requirements
      SET assigned_professional_id = ?,
          status = 'Assigned'
      WHERE id = ?
    `).run(professionalId, requirementId);

    res.json({
      message: "Requirement assigned successfully",
    });
  }
);

/* =========================================================
   QUOTATIONS - SUBMIT
========================================================= */

app.post("/api/quotations", auth, (req, res) => {
  if (req.user.role !== "architect") {
    return res.status(403).json({
      message: "Only architects can submit design quotations",
    });
  }

  const {
    requirement_id,
    design_charges = 0,
    plan_2d_charges = 0,
    plan_3d_charges = 0,
    elevation_charges = 0,
    structural_charges = 0,
    total_amount = 0,
    revisions = 0,
    delivery_days = 0,
    services_included = "",
    gst = 0,
    terms = "",
  } = req.body || {};

  const requirement = db
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(Number(requirement_id));

  if (!requirement) {
    return res.status(404).json({
      message: "Requirement not found",
    });
  }

  const assigned = db
    .prepare(`
      SELECT *
      FROM requirement_assignments
      WHERE requirement_id = ?
        AND professional_id = ?
    `)
    .get(Number(requirement_id), req.user.id);

  if (!assigned && requirement.assigned_professional_id !== req.user.id) {
    return res.status(403).json({
      message: "This requirement is not assigned to you",
    });
  }

  const info = db
    .prepare(`
      INSERT INTO quotations
      (
        requirement_id,
        professional_id,
        design_charges,
        plan_2d_charges,
        plan_3d_charges,
        elevation_charges,
        structural_charges,
        total_amount,
        revisions,
        delivery_days,
        services_included,
        gst,
        terms,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .run(
      Number(requirement_id),
      req.user.id,
      Number(design_charges || 0),
      Number(plan_2d_charges || 0),
      Number(plan_3d_charges || 0),
      Number(elevation_charges || 0),
      Number(structural_charges || 0),
      Number(total_amount || 0),
      Number(revisions || 0),
      Number(delivery_days || 0),
      services_included || "",
      Number(gst || 0),
      terms || "",
      "Submitted"
    );

  res.status(201).json({
    message: "Quotation submitted successfully",
    quotation: db
      .prepare("SELECT * FROM quotations WHERE id = ?")
      .get(info.lastInsertRowid),
  });
});

/* =========================================================
   QUOTATIONS - CUSTOMER COMPARE
========================================================= */

app.get("/api/quotations/:requirementId", auth, (req, res) => {
  const requirementId = Number(req.params.requirementId);

  const requirement = db
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(requirementId);

  if (!requirement) {
    return res.status(404).json({
      message: "Requirement not found",
    });
  }

  if (
    req.user.role === "customer" &&
    requirement.user_id !== req.user.id
  ) {
    return res.status(403).json({
      message: "Access denied",
    });
  }

  const quotations = db
    .prepare(`
      SELECT
        q.*,
        u.name AS professional_name,
        u.city AS professional_city,
        u.experience_years,
        u.rating,
        u.review_count,
        u.portfolio
      FROM quotations q
      JOIN users u ON u.id = q.professional_id
      WHERE q.requirement_id = ?
      ORDER BY q.total_amount ASC, q.id DESC
    `)
    .all(requirementId);

  res.json({
    quotations,
  });
});

/* =========================================================
   BOOKINGS
========================================================= */

app.post("/api/bookings", auth, (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({
      message: "Only customers can select quotations",
    });
  }

  const requirementId = Number(req.body.requirement_id);
  const quotationId = Number(req.body.quotation_id);

  const requirement = db
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(requirementId);

  const quotation = db
    .prepare("SELECT * FROM quotations WHERE id = ?")
    .get(quotationId);

  if (!requirement || !quotation) {
    return res.status(404).json({
      message: "Requirement or quotation not found",
    });
  }

  if (requirement.user_id !== req.user.id) {
    return res.status(403).json({
      message: "Access denied",
    });
  }

  const existing = db
    .prepare(`
      SELECT id
      FROM bookings
      WHERE requirement_id = ?
        AND customer_id = ?
    `)
    .get(requirementId, req.user.id);

  if (existing) {
    return res.status(409).json({
      message: "A booking already exists for this requirement",
    });
  }

  const info = db
    .prepare(`
      INSERT INTO bookings
      (
        requirement_id,
        quotation_id,
        customer_id,
        professional_id,
        status,
        payment_status
      )
      VALUES (?,?,?,?,?,?)
    `)
    .run(
      requirementId,
      quotationId,
      req.user.id,
      quotation.professional_id,
      "Quotation Selected",
      "Pending"
    );

  db.prepare(`
    UPDATE requirements
    SET status = 'Quotation Selected'
    WHERE id = ?
  `).run(requirementId);

  db.prepare(`
    INSERT INTO projects
    (
      booking_id,
      requirement_id,
      customer_id,
      professional_id,
      status,
      progress
    )
    VALUES (?,?,?,?,?,?)
  `).run(
    info.lastInsertRowid,
    requirementId,
    req.user.id,
    quotation.professional_id,
    "Booking Confirmed",
    0
  );

  res.status(201).json({
    message: "Booking created successfully",
    booking: db
      .prepare("SELECT * FROM bookings WHERE id = ?")
      .get(info.lastInsertRowid),
  });
});

app.get("/api/bookings", auth, (req, res) => {
  let bookings;

  if (req.user.role === "admin") {
    bookings = db
      .prepare(`
        SELECT
          b.*,
          r.request_id,
          r.title,
          cu.name AS customer_name,
          pu.name AS professional_name,
          q.total_amount
        FROM bookings b
        JOIN requirements r ON r.id = b.requirement_id
        JOIN users cu ON cu.id = b.customer_id
        JOIN users pu ON pu.id = b.professional_id
        JOIN quotations q ON q.id = b.quotation_id
        ORDER BY b.id DESC
      `)
      .all();
  } else {
    bookings = db
      .prepare(`
        SELECT
          b.*,
          r.request_id,
          r.title,
          q.total_amount,
          u.name AS professional_name
        FROM bookings b
        JOIN requirements r ON r.id = b.requirement_id
        JOIN quotations q ON q.id = b.quotation_id
        JOIN users u ON u.id = b.professional_id
        WHERE b.customer_id = ?
           OR b.professional_id = ?
        ORDER BY b.id DESC
      `)
      .all(req.user.id, req.user.id);
  }

  res.json({ bookings });
});

/* =========================================================
   PROJECTS
========================================================= */

app.get("/api/projects", auth, (req, res) => {
  let projects;

  if (req.user.role === "admin") {
    projects = db
      .prepare(`
        SELECT
          p.*,
          r.request_id,
          r.title
        FROM projects p
        JOIN requirements r ON r.id = p.requirement_id
        ORDER BY p.id DESC
      `)
      .all();
  } else {
    projects = db
      .prepare(`
        SELECT
          p.*,
          r.request_id,
          r.title
        FROM projects p
        JOIN requirements r ON r.id = p.requirement_id
        WHERE p.customer_id = ?
           OR p.professional_id = ?
        ORDER BY p.id DESC
      `)
      .all(req.user.id, req.user.id);
  }

  res.json({ projects });
});

/* =========================================================
   MATERIALS
========================================================= */

app.get("/api/materials", (req, res) => {
  const city = req.query.city;

  let materials;

  if (city) {
    materials = db
      .prepare(`
        SELECT
          m.*,
          u.name AS vendor_name
        FROM materials m
        LEFT JOIN users u ON u.id = m.vendor_id
        WHERE lower(m.city) = lower(?)
        ORDER BY m.category,m.name
      `)
      .all(city);
  } else {
    materials = db
      .prepare(`
        SELECT
          m.*,
          u.name AS vendor_name
        FROM materials m
        LEFT JOIN users u ON u.id = m.vendor_id
        ORDER BY m.category,m.name
      `)
      .all();
  }

  res.json({ materials });
});

/* =========================================================
   MATERIAL REQUESTS
========================================================= */

app.post("/api/material-requests", auth, (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({
      message: "Only customers can create material requests",
    });
  }

  const {
    city = "",
    details = "",
    items = [],
  } = req.body || {};

  const request_code = makeCode("MAT");

  const info = db
    .prepare(`
      INSERT INTO material_requests
      (request_code,customer_id,city,details,status)
      VALUES (?,?,?,?,?)
    `)
    .run(
      request_code,
      req.user.id,
      city,
      details,
      "New Request"
    );

  const requestId = info.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO material_request_items
    (material_request_id,material_name,quantity,unit)
    VALUES (?,?,?,?)
  `);

  const addItems = db.transaction((rows) => {
    for (const item of rows) {
      insertItem.run(
        requestId,
        item.material_name || item.name || "",
        Number(item.quantity || 0),
        item.unit || ""
      );
    }
  });

  addItems(Array.isArray(items) ? items : []);

  res.status(201).json({
    message: "Material request submitted",
    request: db
      .prepare("SELECT * FROM material_requests WHERE id = ?")
      .get(requestId),
  });
});

app.get("/api/material-requests", auth, (req, res) => {
  let requests;

  if (req.user.role === "admin" || req.user.role === "vendor") {
    requests = db
      .prepare(`
        SELECT
          mr.*,
          u.name AS customer_name,
          u.phone AS customer_phone
        FROM material_requests mr
        JOIN users u ON u.id = mr.customer_id
        ORDER BY mr.id DESC
      `)
      .all();
  } else {
    requests = db
      .prepare(`
        SELECT *
        FROM material_requests
        WHERE customer_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.id);
  }

  res.json({ requests });
});

/* =========================================================
   MATERIAL ORDERS
========================================================= */

app.get("/api/material-orders", auth, (req, res) => {
  let orders;

  if (req.user.role === "admin") {
    orders = db
      .prepare(`
        SELECT
          mo.*,
          c.name AS customer_name,
          v.name AS vendor_name
        FROM material_orders mo
        JOIN users c ON c.id = mo.customer_id
        LEFT JOIN users v ON v.id = mo.vendor_id
        ORDER BY mo.id DESC
      `)
      .all();
  } else if (req.user.role === "vendor") {
    orders = db
      .prepare(`
        SELECT *
        FROM material_orders
        WHERE vendor_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.id);
  } else {
    orders = db
      .prepare(`
        SELECT *
        FROM material_orders
        WHERE customer_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.id);
  }

  res.json({ orders });
});

/* =========================================================
   DOCUMENTS
========================================================= */

app.get("/api/documents", auth, (req, res) => {
  let documents;

  if (req.user.role === "admin") {
    documents = db
      .prepare(`
        SELECT
          d.*,
          u.name AS user_name
        FROM documents d
        JOIN users u ON u.id = d.user_id
        ORDER BY d.id DESC
      `)
      .all();
  } else {
    documents = db
      .prepare(`
        SELECT *
        FROM documents
        WHERE user_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.id);
  }

  res.json({ documents });
});

/* =========================================================
   PAYMENTS
========================================================= */

app.get("/api/payments", auth, (req, res) => {
  let payments;

  if (req.user.role === "admin") {
    payments = db
      .prepare(`
        SELECT
          p.*,
          u.name AS user_name,
          u.email
        FROM payments p
        JOIN users u ON u.id = p.user_id
        ORDER BY p.id DESC
      `)
      .all();
  } else {
    payments = db
      .prepare(`
        SELECT *
        FROM payments
        WHERE user_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.id);
  }

  res.json({ payments });
});

/* =========================================================
   ADMIN - APPROVE PROFESSIONAL
========================================================= */

app.post(
  "/api/admin/users/:id/approve",
  auth,
  adminOnly,
  (req, res) => {
    const id = Number(req.params.id);

    db.prepare(`
      UPDATE users
      SET approval_status = 'approved'
      WHERE id = ?
        AND role IN ('architect','vendor')
    `).run(id);

    res.json({
      message: "Professional approved successfully",
    });
  }
);

/* =========================================================
   ADMIN - REJECT PROFESSIONAL
========================================================= */

app.post(
  "/api/admin/users/:id/reject",
  auth,
  adminOnly,
  (req, res) => {
    const id = Number(req.params.id);

    db.prepare(`
      UPDATE users
      SET approval_status = 'rejected'
      WHERE id = ?
        AND role IN ('architect','vendor')
    `).run(id);

    res.json({
      message: "Professional rejected",
    });
  }
);

/* =========================================================
   PROJECT STATUS
========================================================= */

app.post("/api/projects/:id/status", auth, (req, res) => {
  const id = Number(req.params.id);
  const { status = "", progress = 0 } = req.body || {};

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id);

  if (!project) {
    return res.status(404).json({
      message: "Project not found",
    });
  }

  const allowed =
    req.user.role === "admin" ||
    project.customer_id === req.user.id ||
    project.professional_id === req.user.id;

  if (!allowed) {
    return res.status(403).json({
      message: "Access denied",
    });
  }

  db.prepare(`
    UPDATE projects
    SET status = ?, progress = ?
    WHERE id = ?
  `).run(status, Number(progress || 0), id);

  res.json({
    message: "Project updated successfully",
  });
});

/* =========================================================
   REVIEWS
========================================================= */

app.post("/api/reviews", auth, (req, res) => {
  const {
    professional_id,
    booking_id = null,
    rating = 5,
    review = "",
  } = req.body || {};

  if (req.user.role !== "customer") {
    return res.status(403).json({
      message: "Only customers can submit reviews",
    });
  }

  db.prepare(`
    INSERT INTO reviews
    (customer_id,professional_id,booking_id,rating,review)
    VALUES (?,?,?,?,?)
  `).run(
    req.user.id,
    Number(professional_id),
    booking_id ? Number(booking_id) : null,
    Math.max(1, Math.min(5, Number(rating))),
    review
  );

  const stats = db
    .prepare(`
      SELECT
        AVG(rating) AS rating,
        COUNT(*) AS review_count
      FROM reviews
      WHERE professional_id = ?
    `)
    .get(Number(professional_id));

  db.prepare(`
    UPDATE users
    SET rating = ?, review_count = ?
    WHERE id = ?
  `).run(
    Number(stats.rating || 0),
    Number(stats.review_count || 0),
    Number(professional_id)
  );

  res.status(201).json({
    message: "Review submitted successfully",
  });
});

/* =========================================================
   DISPUTES
========================================================= */

app.post("/api/disputes", auth, (req, res) => {
  const {
    professional_id = null,
    booking_id = null,
    subject = "",
    description = "",
  } = req.body || {};

  const info = db
    .prepare(`
      INSERT INTO disputes
      (customer_id,professional_id,booking_id,subject,description,status)
      VALUES (?,?,?,?,?,?)
    `)
    .run(
      req.user.role === "customer" ? req.user.id : null,
      professional_id ? Number(professional_id) : null,
      booking_id ? Number(booking_id) : null,
      subject,
      description,
      "Open"
    );

  res.status(201).json({
    message: "Dispute created",
    id: info.lastInsertRowid,
  });
});

app.get("/api/disputes", auth, adminOnly, (req, res) => {
  const disputes = db
    .prepare(`
      SELECT
        d.*,
        c.name AS customer_name,
        p.name AS professional_name
      FROM disputes d
      LEFT JOIN users c ON c.id = d.customer_id
      LEFT JOIN users p ON p.id = d.professional_id
      ORDER BY d.id DESC
    `)
    .all();

  res.json({ disputes });
});

/* =========================================================
   ROOT
========================================================= */

app.get("/", (req, res) => {
  res.json({
    service: "HomeBuild API",
    status: "running",
    health: "/api/health",
  });
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    message: "Internal server error",
  });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(`HomeBuild API running on http://localhost:${PORT}`);
});