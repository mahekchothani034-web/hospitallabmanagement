import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const databaseDirectory = process.env.DATA_DIR || path.resolve(root, "..", "database");
const dataPath = path.join(databaseDirectory, "data.json");
const uploadDirectory = path.join(databaseDirectory, "uploads");
const port = Number(process.env.PORT || 4000);
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}
const jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret";

mkdirSync(uploadDirectory, { recursive: true });

function initialData() {
  const passwordHash = bcrypt.hashSync("CareLab123!", 10);
  const adminId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const technicianId = randomUUID();
  const receptionistId = randomUUID();
  return {
    users: [
      { id: adminId, name: "CareLab Admin", email: "admin@carelab.test", phone: "9876500001", role: "admin", passwordHash },
      { id: doctorId, name: "Dr. Aditi Kulkarni", email: "doctor@carelab.test", phone: "9876500002", role: "doctor", specialization: "Pathology", passwordHash },
      { id: patientId, name: "Aarav Patil", email: "patient@carelab.test", phone: "9876500003", role: "patient", passwordHash },
      { id: technicianId, name: "Neha Shah", email: "tech@carelab.test", phone: "9876500004", role: "technician", passwordHash },
      { id: receptionistId, name: "Maya Joshi", email: "reception@carelab.test", phone: "9876500005", role: "receptionist", passwordHash },
    ],
    tests: [
      { id: randomUUID(), name: "Blood Test", category: "Blood", price: 450 },
      { id: randomUUID(), name: "Urine Routine", category: "Urine", price: 300 },
      { id: randomUUID(), name: "Blood Sugar", category: "Sugar", price: 180 },
      { id: randomUUID(), name: "Thyroid Profile", category: "Thyroid", price: 650 },
      { id: randomUUID(), name: "CBC", category: "Blood", price: 500 },
      { id: randomUUID(), name: "Biochemistry Panel", category: "Biochemistry", price: 850 },
    ],
    doctors: [
      { id: doctorId, name: "Dr. Aditi Kulkarni", specialization: "Pathology", phone: "9876500002" },
      { id: randomUUID(), name: "Dr. Rohan Deshmukh", specialization: "Biochemistry", phone: "9876500006" },
      { id: randomUUID(), name: "Dr. Sara Khan", specialization: "Endocrinology", phone: "9876500007" },
    ],
    bookings: [],
    reports: [],
    contacts: [],
  };
}

if (!existsSync(dataPath)) writeFileSync(dataPath, JSON.stringify(initialData(), null, 2));

let data = JSON.parse(readFileSync(dataPath, "utf8"));
data.passwordResets ||= [];
function save() {
  writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission to do that." });
    next();
  };
}

function visibleTo(user, booking) {
  return user.role !== "patient" || booking.patientId === user.id;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/doctors", (_req, res) => res.json(data.doctors));
app.get("/api/tests", (_req, res) => res.json(data.tests));

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim() || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Enter your name, email, phone, and a password of at least 8 characters." });
    }
    if (data.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: "patient",
      passwordHash: await bcrypt.hash(password, 10),
    };
    data.users.push(user);
    save();
    const safeUser = publicUser(user);
    res.status(201).json({ user: safeUser, token: jwt.sign(safeUser, jwtSecret, { expiresIn: "12h" }) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = data.users.find((entry) => entry.email === String(email || "").trim().toLowerCase());
    if (!user || !(await bcrypt.compare(String(password || ""), user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const safeUser = publicUser(user);
    res.json({ user: safeUser, token: jwt.sign(safeUser, jwtSecret, { expiresIn: "12h" }) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Enter your registered email address." });
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ error: "Password reset email is not configured. Set SMTP_USER and SMTP_PASS in backend/.env." });
    }
    const user = data.users.find((entry) => entry.email.toLowerCase() === email);
    if (user) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const codeHash = createHash("sha256").update(`${user.id}:${code}:${jwtSecret}`).digest("hex");
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: "Your CareLab password reset code",
          text: `Hello ${user.name},\n\nYour CareLab verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        });
      } catch {
        console.error("Failed to send password reset verification email.");
        return res.status(502).json({ error: "We couldn't send the verification email. Check the Gmail SMTP settings and try again." });
      }
      data.passwordResets = data.passwordResets.filter((entry) => entry.userId !== user.id);
      data.passwordResets.push({
        userId: user.id,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });
      save();
    }
    res.json({ message: "If an account exists for that email, a verification code has been sent. The code expires in 10 minutes." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const { password } = req.body;
    if (!email || !/^\d{6}$/.test(code) || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Enter your email, 6-digit verification code, and a new password of at least 8 characters." });
    }
    const user = data.users.find((entry) => entry.email.toLowerCase() === email);
    const reset = data.passwordResets.find((entry) => entry.userId === user?.id);
    if (!user || !reset || reset.expiresAt < Date.now() || reset.attempts >= 5) {
      if (reset && (reset.expiresAt < Date.now() || reset.attempts >= 5)) {
        data.passwordResets = data.passwordResets.filter((entry) => entry !== reset);
        save();
      }
      return res.status(400).json({ error: "The verification code is invalid or expired. Request a new code." });
    }
    const expected = Buffer.from(reset.codeHash, "hex");
    const actual = Buffer.from(createHash("sha256").update(`${user.id}:${code}:${jwtSecret}`).digest("hex"), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      reset.attempts += 1;
      save();
      return res.status(400).json({ error: "The verification code is invalid or expired. Check the code or request a new one." });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    data.passwordResets = data.passwordResets.filter((entry) => entry !== reset);
    save();
    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const bookings = data.bookings
    .filter((booking) => visibleTo(req.user, booking))
    .map((booking) => ({
      ...booking,
      patient: data.users.find((user) => user.id === booking.patientId)
        ? publicUser(data.users.find((user) => user.id === booking.patientId))
        : null,
      report: (() => {
        const report = data.reports.find((entry) => entry.bookingId === booking.id);
        if (!report) return null;
        const technician = data.users.find((entry) => entry.id === report.technicianId);
        const editor = data.users.find((entry) => entry.id === report.updatedBy);
        return {
          ...report,
          technicianName: technician?.name || "Not assigned",
          updatedByName: editor?.name || null,
        };
      })(),
    }));
  res.json({
    user: req.user,
    bookings,
    doctors: req.user.role === "admin" ? data.doctors : [],
    tests: data.tests,
    users: req.user.role === "admin"
      ? data.users.map(publicUser)
      : ["receptionist", "doctor"].includes(req.user.role)
        ? data.users.filter((user) => user.role === "patient").map(publicUser)
        : [],
  });
});

app.post("/api/bookings", requireAuth, allowRoles("patient", "doctor", "receptionist"), (req, res) => {
  const { testId, date, patientId } = req.body;
  const test = data.tests.find((entry) => entry.id === testId);
  const targetPatientId = req.user.role === "patient" ? req.user.id : patientId || req.user.id;
  const patient = data.users.find((entry) => entry.id === targetPatientId && entry.role === "patient");
  if (!test || !patient || !date) return res.status(400).json({ error: "Choose a valid patient, test, and date." });
  const booking = {
    id: randomUUID(),
    patientId: patient.id,
    testId: test.id,
    testName: test.name,
    date,
    status: "Booked",
    result: "",
    technicianId: null,
    createdAt: new Date().toISOString(),
  };
  data.bookings.push(booking);
  save();
  res.status(201).json(booking);
});

app.post("/api/reception/patients", requireAuth, allowRoles("receptionist"), async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim() || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Enter the patient's name, email, phone, and a password of at least 8 characters." });
    }
    if (data.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    const patient = {
      id: randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: "patient",
      passwordHash: await bcrypt.hash(password, 10),
    };
    data.users.push(patient);
    save();
    res.status(201).json(publicUser(patient));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/bookings/:id", requireAuth, allowRoles("admin", "technician"), (req, res) => {
  const booking = data.bookings.find((entry) => entry.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  const { status, result } = req.body;
  const allowedStatuses = req.user.role === "admin"
    ? ["Booked", "Collected", "Processing", "Done"]
    : ["Collected", "Processing", "Done"];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `Choose one of: ${allowedStatuses.join(", ")}.` });
  }
  const nextResult = typeof result === "string" ? result.trim() : booking.result;
  const nextStatus = status || booking.status;
  if (nextStatus === "Done" && !nextResult) {
    return res.status(400).json({ error: "Enter the test result before marking it Done." });
  }
  if (status) booking.status = status;
  if (typeof result === "string") booking.result = nextResult;
  if (req.user.role === "technician") booking.technicianId = req.user.id;
  if (nextResult && (typeof result === "string" || nextStatus === "Done")) {
    const report = data.reports.find((entry) => entry.bookingId === booking.id);
    const reportFields = {
      patientId: booking.patientId,
      testName: booking.testName,
      result: nextResult,
      date: new Date().toISOString(),
      technicianId: booking.technicianId,
      updatedBy: req.user.id,
      pdfName: report?.pdfName,
    };
    if (report) Object.assign(report, reportFields);
    else data.reports.push({ id: randomUUID(), bookingId: booking.id, ...reportFields });
  }
  save();
  res.json(booking);
});

app.post("/api/reports/:bookingId/pdf", requireAuth, allowRoles("admin", "technician"), (req, res, next) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => callback(null, uploadDirectory),
      filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (file.mimetype !== "application/pdf" || path.extname(file.originalname).toLowerCase() !== ".pdf") {
        return callback(new Error("Upload a PDF file only."));
      }
      callback(null, true);
    },
  }).single("report");
  upload(req, res, (error) => {
    if (error) return next(error);
    const booking = data.bookings.find((entry) => entry.id === req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!booking.result.trim()) return res.status(400).json({ error: "Enter the test result before uploading a report." });
    const report = {
      id: randomUUID(),
      bookingId: booking.id,
      patientId: booking.patientId,
      testName: booking.testName,
      result: booking.result,
      date: new Date().toISOString(),
      technicianId: req.user.role === "technician" ? req.user.id : booking.technicianId,
      pdfName: req.file?.filename,
      updatedBy: req.user.id,
    };
    if (!req.file) return res.status(400).json({ error: "Choose a PDF report to upload." });
    const previous = data.reports.findIndex((entry) => entry.bookingId === booking.id);
    if (previous >= 0) data.reports[previous] = report;
    else data.reports.push(report);
    booking.status = "Done";
    if (req.user.role === "technician") booking.technicianId = req.user.id;
    save();
    res.status(201).json(report);
  });
});

app.get("/api/reports/:id/download", requireAuth, async (req, res, next) => {
  try {
    const report = data.reports.find((entry) => entry.id === req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found." });
    if (req.user.role === "patient" && report.patientId !== req.user.id) {
      return res.status(403).json({ error: "You cannot access this report." });
    }
    const technician = data.users.find((user) => user.id === report.technicianId);
    const editor = data.users.find((user) => user.id === report.updatedBy);
    const patient = data.users.find((user) => user.id === report.patientId);
    const booking = data.bookings.find((entry) => entry.id === report.bookingId);
    const fileName = `${report.testName.replace(/[^\w.-]+/g, "-")}-report.pdf`;
    if (report.pdfName) {
      return res.download(path.join(uploadDirectory, path.basename(report.pdfName)), fileName);
    }

    const pdf = await new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      document.on("data", (chunk) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.fillColor("#173c32").fontSize(22).text("CareLab Test Report");
      document.moveDown(0.5).fillColor("#718d42").fontSize(13).text(report.testName);
      document.moveDown().fillColor("#18352e").fontSize(11);
      [
        ["Report ID", report.id],
        ["Patient", patient?.name || "Unknown"],
        ["Phone", patient?.phone || "—"],
        ["Result", report.result],
        ["Booking date", booking?.date || "N/A"],
        ["Report date", new Date(report.date).toLocaleDateString()],
        ["Technician", technician?.name || "Not assigned"],
        ["Updated by", editor?.name || "—"],
      ].forEach(([label, value]) => {
        document.font("Helvetica-Bold").text(`${label}: `, { continued: true });
        document.font("Helvetica").text(String(value || "—"));
        document.moveDown(0.35);
      });
      document.moveDown(2).fillColor("#718079").fontSize(9).text("CareLab Diagnostics · Accurate reports, faster care.");
      document.end();
    });
    return res.type("application/pdf").attachment(fileName).send(pdf);
  } catch (error) {
    next(error);
  }
});

app.post("/api/contact", (req, res) => {
  const { name, phone, message } = req.body;
  if (!name?.trim() || !phone?.trim() || !message?.trim()) {
    return res.status(400).json({ error: "Enter your name, phone number, and message." });
  }
  data.contacts.push({ id: randomUUID(), name: name.trim(), phone: phone.trim(), message: message.trim(), date: new Date().toISOString() });
  save();
  res.status(201).json({ message: "Thanks for contacting CareLab. We will get back to you soon." });
});

app.post("/api/admin/doctors", requireAuth, allowRoles("admin"), (req, res) => {
  const { name, specialization, phone } = req.body;
  if (!name?.trim() || !specialization?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: "Enter the doctor's name, specialization, and phone." });
  }
  const doctor = { id: randomUUID(), name: name.trim(), specialization: specialization.trim(), phone: phone.trim() };
  data.doctors.push(doctor);
  save();
  res.status(201).json(doctor);
});

app.delete("/api/admin/doctors/:id", requireAuth, allowRoles("admin"), (req, res) => {
  const doctorIndex = data.doctors.findIndex((doctor) => doctor.id === req.params.id);
  if (doctorIndex < 0) return res.status(404).json({ error: "Doctor not found." });
  const [doctor] = data.doctors.splice(doctorIndex, 1);
  data.users = data.users.filter((user) => user.id !== doctor.id);
  save();
  res.status(204).end();
});

app.post("/api/admin/users", requireAuth, allowRoles("admin"), async (req, res, next) => {
  try {
    const { name, email, phone, role, password, specialization } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim() || !["doctor", "technician", "receptionist"].includes(role) ||
      typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Enter a name, email, phone, valid staff role, and password of at least 8 characters." });
    }
    if (data.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role,
      ...(role === "doctor" ? { specialization: specialization?.trim() || "General" } : {}),
      passwordHash: await bcrypt.hash(password, 10),
    };
    data.users.push(user);
    if (role === "doctor") {
      data.doctors.push({ id: user.id, name: user.name, specialization: user.specialization, phone: user.phone });
    }
    save();
    res.status(201).json(publicUser(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/tests", requireAuth, allowRoles("admin"), (req, res) => {
  const { name, category, price } = req.body;
  if (!name?.trim() || !category?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: "Enter a test name, category, and valid non-negative cost." });
  }
  const test = { id: randomUUID(), name: name.trim(), category: category.trim(), price: Number(price) };
  data.tests.push(test);
  save();
  res.status(201).json(test);
});

app.patch("/api/admin/tests/:id", requireAuth, allowRoles("admin"), (req, res) => {
  const test = data.tests.find((entry) => entry.id === req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found." });
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: "Enter a valid non-negative test cost." });
  }
  test.price = price;
  save();
  res.json(test);
});

app.delete("/api/admin/tests/:id", requireAuth, allowRoles("admin"), (req, res) => {
  const index = data.tests.findIndex((test) => test.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Test not found." });
  if (data.bookings.some((booking) => booking.testId === req.params.id)) {
    return res.status(409).json({ error: "This test has bookings and cannot be removed." });
  }
  data.tests.splice(index, 1);
  save();
  res.status(204).end();
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.message?.startsWith("Upload a PDF") ? 400 : 500).json({
    error: error.message?.startsWith("Upload a PDF") ? error.message : "Something went wrong. Please try again.",
  });
});

app.listen(port, () => console.log(`CareLab API listening at http://localhost:${port}`));
