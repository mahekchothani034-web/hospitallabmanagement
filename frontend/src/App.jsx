import { useEffect, useState } from "react";

const roles = ["admin", "doctor", "patient", "technician", "receptionist"];
const roleLabels = { admin: "Admin", doctor: "Doctor", patient: "Patient", technician: "Lab Technician", receptionist: "Receptionist" };
const apiBaseUrl = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/+$/, "");

function apiUrl(path) {
  if (!apiBaseUrl) {
    throw new Error("CareLab API is not configured. Set VITE_API_URL to your deployed backend URL (for example https://your-api.onrender.com).");
  }
  return `${apiBaseUrl}${path}`;
}

async function api(url, { token, ...options } = {}) {
  const response = await fetch(apiUrl(url), {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || "The request could not be completed.");
  }
  return response.status === 204 ? null : response.json();
}

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("carelab-session")); } catch { return null; }
  });
  const [page, setPage] = useState(window.location.hash.slice(1) || "home");
  const [doctors, setDoctors] = useState([]);
  const [tests, setTests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [resetStep, setResetStep] = useState("email");
  const [resetEmail, setResetEmail] = useState("");

  function navigate(next) {
    setPage(next);
    window.location.hash = next;
    window.scrollTo(0, 0);
  }

  async function loadPublic() {
    try {
      const [doctorList, testList] = await Promise.all([api("/api/doctors"), api("/api/tests")]);
      setDoctors(doctorList);
      setTests(testList);
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function loadDashboard(token = session?.token, refreshedDashboard = null) {
    if (!token) return;
    try {
      const result = refreshedDashboard || await api("/api/dashboard", { token });
      setDashboard(result);
      setTests(result.tests);
    } catch (reason) {
      setError(reason.message);
    }
  }

  useEffect(() => { loadPublic(); }, []);
  useEffect(() => { loadDashboard(); }, [session?.token]);
  useEffect(() => {
    const onHash = () => setPage(window.location.hash.slice(1) || "home");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function signOut() {
    localStorage.removeItem("carelab-session");
    setSession(null);
    setDashboard(null);
    navigate("home");
  }

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(`/api/auth/${authMode === "register" ? "register" : "login"}`, {
        method: "POST", body: JSON.stringify(form),
      });
      localStorage.setItem("carelab-session", JSON.stringify(result));
      setSession(result);
      setNotice(`Welcome, ${result.user.name}.`);
      navigate("dashboard");
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function requestPasswordCode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const email = new FormData(event.currentTarget).get("email");
    try {
      const result = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setResetEmail(String(email).trim());
      setResetStep("code");
      setNotice(result.message);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function resendPasswordCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: resetEmail }) });
      setNotice(result.message);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function submitPasswordReset(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }
    delete form.confirmPassword;
    try {
      const result = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify(form) });
      setNotice(result.message);
      setResetStep("email");
      navigate("login");
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function submitContact(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    try {
      const result = await api("/api/contact", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(formElement))) });
      setNotice(result.message); formElement.reset();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#home" onClick={() => navigate("home")}><span className="brand-mark">✚</span> care<span>lab</span></a>
        <nav>
          <a href="#home" onClick={() => navigate("home")}>Home</a>
          <a href="#about" onClick={() => navigate("about")}>About</a>
          <a href="#tests" onClick={() => navigate("tests")}>Tests</a>
          <a href="#doctors" onClick={() => navigate("doctors")}>Doctors</a>
          <a href="#contact" onClick={() => navigate("contact")}>Contact</a>
        </nav>
        <div className="nav-actions">
          {session ? <><button className="button button-light" onClick={() => navigate("dashboard")}>Dashboard</button><button className="button button-dark" onClick={signOut}>Log out</button></> :
            <><button className="button button-light" onClick={() => { setAuthMode("login"); navigate("login"); }}>Login</button><button className="button button-dark" onClick={() => { setAuthMode("register"); navigate("register"); }}>Register</button></>}
        </div>
      </header>

      <main>
        {notice && <div className="toast success" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {error && <div className="toast failure" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {page === "home" && <Home doctors={doctors} tests={tests} navigate={navigate} />}
        {page === "about" && <About />}
        {page === "tests" && <TestDirectory tests={tests} navigate={navigate} />}
        {page === "doctors" && <DoctorDirectory doctors={doctors} />}
        {page === "contact" && <Contact onSubmit={submitContact} busy={busy} />}
        {(page === "login" || page === "register" || page === "forgot-password") && <AuthPage mode={page} resetStep={resetStep} resetEmail={resetEmail} setMode={(mode) => { setAuthMode(mode); setResetStep("email"); setResetEmail(""); navigate(mode); }} onSubmit={page === "forgot-password" ? resetStep === "email" ? requestPasswordCode : submitPasswordReset : submitAuth} onResendCode={resendPasswordCode} busy={busy} />}
        {page === "dashboard" && (session
          ? dashboard ? <Dashboard data={dashboard} session={session} reload={loadDashboard} setError={setError} setNotice={setNotice} navigate={navigate} />
            : <section className="section empty"><p>Loading your dashboard…</p></section>
          : <AuthPage mode="login" setMode={(mode) => navigate(mode)} onSubmit={submitAuth} busy={busy} />)}
      </main>
      <Footer navigate={navigate} />
    </>
  );
}

function Home({ doctors, tests, navigate }) {
  return <>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="pulse" /> TRUSTED DIAGNOSTICS, THOUGHTFUL CARE</div>
        <h1>Accurate Reports,<br /><span>Faster Care.</span></h1>
        <p>Reliable lab testing made simple. Book your tests, track every step, and get clear results when you need them.</p>
        <div className="hero-actions"><button className="button button-dark button-large" onClick={() => navigate("register")}>Register for a test <span>↗</span></button><button className="button button-outline button-large" onClick={() => navigate("login")}>Login to your account</button></div>
        <div className="trust-line"><span>✓</span> Accurate testing <span>✓</span> Secure reports <span>✓</span> Caring team</div>
      </div>
      <div className="hero-art"><div className="art-circle circle-back" /><div className="art-circle circle-front" /><div className="lab-illustration"><div className="tube tube-one" /><div className="tube tube-two" /><div className="tube tube-three" /><div className="flask">✚</div><div className="chart"><span>REPORT READY</span><div className="chart-line">⌁⌁⌁⌁</div><b>All results look good</b></div></div><div className="floating-tag tag-top">✦ &nbsp; Results you can trust</div><div className="floating-tag tag-bottom"><span className="mini-icon">✓</span><div><b>Fast & reliable</b><small>Care at every step</small></div></div></div>
      <div className="hero-decor">✳</div>
    </section>
    <section className="section stats-row"><div><b>6+</b><span>Essential test panels</span></div><div><b>4</b><span>Simple care steps</span></div><div><b>100%</b><span>Patient-first approach</span></div><div><b>1 place</b><span>From booking to report</span></div></section>
    <TestSection tests={tests.slice(0, 6)} navigate={navigate} />
    <HowItWorks />
    <section className="section doctor-preview"><div className="section-heading"><div><span className="eyebrow">MEET OUR TEAM</span><h2>Care guided by expertise.</h2></div><button className="text-link" onClick={() => navigate("doctors")}>Meet all doctors ↗</button></div><div className="doctor-grid">{doctors.slice(0, 3).map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}</div></section>
    <section className="cta"><div><span className="eyebrow">YOUR HEALTH, MADE SIMPLE</span><h2>Take the next step<br />toward feeling your best.</h2></div><button className="button button-light button-large" onClick={() => navigate("register")}>Book your first test <span>↗</span></button></section>
  </>;
}

function About() {
  return <section className="section page-section"><span className="eyebrow">ABOUT CARELAB</span><h1>Better diagnostics.<br /><span>More confident care.</span></h1><p className="lead">We bring dependable laboratory testing and thoughtful service together, so you can focus on what matters: your health.</p><div className="about-cards"><article><span>01</span><h3>Accuracy first</h3><p>Our structured workflows help every sample receive careful, consistent attention.</p></article><article><span>02</span><h3>Clear progress</h3><p>Know where your sample is in its journey, from collection through processing to completion.</p></article><article><span>03</span><h3>People at heart</h3><p>Patients, doctors, receptionists and lab teams can work together in one place.</p></article></div></section>;
}

function TestDirectory({ tests, navigate }) {
  return <section className="section page-section"><span className="eyebrow">OUR SERVICES</span><h1>Tests for your<br /><span>everyday health.</span></h1><p className="lead">Choose a test and book an appointment with the CareLab team.</p><TestSection tests={tests} navigate={navigate} /></section>;
}

function TestSection({ tests, navigate }) {
  const icons = { Blood: "◉", Urine: "◌", Sugar: "⌁", Thyroid: "✳", Biochemistry: "⌬" };
  return <section className="section tests-section"><div className="section-heading"><div><span className="eyebrow">OUR SERVICES</span><h2>Care that starts with clarity.</h2><p>Essential testing, with reliable support at every step.</p></div><button className="text-link" onClick={() => navigate("tests")}>Explore all tests ↗</button></div><div className="test-grid">{tests.map((test) => <article className="test-card" key={test.id}><div className="test-icon">{icons[test.category] || "✚"}</div><span className="test-category">{test.category}</span><h3>{test.name}</h3><div className="test-bottom"><b>₹{test.price}</b><button aria-label={`Book ${test.name}`} onClick={() => navigate("register")}>↗</button></div></article>)}</div></section>;
}

function HowItWorks() {
  const steps = [["01", "Register", "Create your secure CareLab account."], ["02", "Book a test", "Choose a test and a convenient date."], ["03", "Give your sample", "Visit us and our team will collect it."], ["04", "Download your report", "Track progress and access results online."]];
  return <section className="section how-section"><div className="section-heading"><div><span className="eyebrow">SIMPLE FROM START TO FINISH</span><h2>Your care, in four easy steps.</h2></div></div><div className="steps">{steps.map(([number, title, text]) => <article className="step" key={number}><span className="step-number">{number}</span><div className="step-line" /><h3>{title}</h3><p>{text}</p></article>)}</div></section>;
}

function DoctorDirectory({ doctors }) {
  return <section className="section page-section"><span className="eyebrow">OUR DOCTORS</span><h1>Meet the people<br /><span>behind your care.</span></h1><p className="lead">Experienced specialists, here to support your health journey.</p><div className="doctor-grid">{doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}</div></section>;
}

function DoctorCard({ doctor }) {
  return <article className="doctor-card"><div className="doctor-avatar">{doctor.name.split(" ").filter(Boolean).slice(-1)[0]?.[0] || "D"}</div><div><h3>{doctor.name}</h3><p>{doctor.specialization}</p><a href={`tel:${doctor.phone}`}>☎ &nbsp;{doctor.phone}</a></div></article>;
}

function Contact({ onSubmit, busy }) {
  return <section className="section contact-layout"><div><span className="eyebrow">WE'RE HERE TO HELP</span><h1>Let's talk<br /><span>about your care.</span></h1><p className="lead">Questions about a test or your visit? Send our team a message.</p><div className="contact-detail"><span>⌖</span><div><b>Visit us</b><p>CareLab Diagnostics, Main Road,<br />Pune, Maharashtra 411001</p></div></div><div className="contact-detail"><span>◷</span><div><b>Opening hours</b><p>Monday – Saturday, 7:00 AM – 8:00 PM<br />Sunday, 8:00 AM – 1:00 PM</p></div></div><div className="contact-detail"><span>☎</span><div><b>Call our team</b><p>+91 20 4000 1234</p></div></div></div><form className="form-card" onSubmit={onSubmit}><h2>Send a message</h2><p>We typically reply within one business day.</p><label>Your name<input name="name" required placeholder="e.g. Ananya Patil" /></label><label>Phone number<input name="phone" required type="tel" placeholder="+91 98765 43210" /></label><label>Your message<textarea name="message" required rows="4" placeholder="How can we help?" /></label><button className="button button-dark button-large" disabled={busy}>{busy ? "Sending…" : "Send message ↗"}</button></form></section>;
}

function AuthPage({ mode, resetStep, resetEmail, setMode, onSubmit, onResendCode, busy }) {
  const register = mode === "register";
  const resetPassword = mode === "forgot-password";
  const enteringCode = resetPassword && resetStep === "code";
  return <section className="auth-wrap"><div className="auth-art"><span className="eyebrow">WELCOME TO CARELAB</span><h2>Your health journey,<br />all in one place.</h2><p>Book tests, follow your sample's progress and find your reports whenever you need them.</p><div className="auth-stamp">✚</div></div><form className="auth-card" onSubmit={onSubmit}><span className="eyebrow">{resetPassword ? "ACCOUNT RECOVERY" : register ? "GET STARTED" : "WELCOME BACK"}</span><h1>{resetPassword ? enteringCode ? "Enter your email code." : "Reset your password." : register ? "Create your account." : "Sign in to CareLab."}</h1><p>{resetPassword ? enteringCode ? `Enter the 6-digit code sent to ${resetEmail}. It expires in 10 minutes.` : "We’ll email a 6-digit verification code to your registered email address." : register ? "Register as a patient to book and track tests." : "Enter your account details to continue."}</p>{register && <label>Full name<input name="name" required placeholder="Your name" /></label>}<label>Email address<input name="email" required type="email" placeholder="you@example.com" defaultValue={enteringCode ? resetEmail : undefined} readOnly={enteringCode} /></label>{register && <label>Phone number<input name="phone" required type="tel" placeholder="+91 98765 43210" /></label>}{enteringCode && <><label>Verification code<input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit code" /></label><label>New password<input name="password" required type="password" minLength="8" placeholder="At least 8 characters" /></label><label>Confirm new password<input name="confirmPassword" required type="password" minLength="8" placeholder="Re-enter your new password" /></label></>}{!resetPassword && <label>Password<input name="password" required type="password" minLength={register ? 8 : undefined} placeholder={register ? "At least 8 characters" : "Your password"} /></label>}<button className="button button-dark button-large" disabled={busy}>{busy ? "Please wait…" : resetPassword ? enteringCode ? "Verify code & reset password ↗" : "Send verification code ↗" : register ? "Create account ↗" : "Login ↗"}</button>{enteringCode && <p className="auth-switch"><button type="button" disabled={busy} onClick={onResendCode}>Resend verification code</button></p>}{!resetPassword && !register && <p className="auth-switch"><button type="button" onClick={() => setMode("forgot-password")}>Forgot password?</button></p>}<p className="auth-switch">{resetPassword ? "Remembered your password?" : register ? "Already have an account?" : "New to CareLab?"} <button type="button" onClick={() => setMode(resetPassword || register ? "login" : "register")}>{resetPassword || register ? "Login" : "Register"}</button></p>{!resetPassword && <details className="demo-logins"><summary>Demo role logins</summary><p>Use password <code>CareLab123!</code> for all demo accounts:</p><ul>{roles.map((role) => <li key={role}>{roleLabels[role]}: <code>{role === "technician" ? "tech" : role === "receptionist" ? "reception" : role}@carelab.test</code></li>)}</ul></details>}</form></section>;
}

function Dashboard({ data, session, reload, setError, setNotice, navigate }) {
  const { user, bookings, tests, users, doctors } = data;
  const [tab, setTab] = useState("overview");
  const [working, setWorking] = useState(false);
  const token = session.token;
  const patients = users?.filter((entry) => entry.role === "patient") || [];
  const isPatientReportsTab = user.role === "patient" && tab === "my reports";

  useEffect(() => {
    if (!isPatientReportsTab) return undefined;
    const refreshReports = () => {
      api("/api/dashboard", { token })
        .then((result) => reload(token, result))
        .catch((reason) => setError(reason.message));
    };
    refreshReports();
    const intervalId = window.setInterval(refreshReports, 5000);
    return () => window.clearInterval(intervalId);
  }, [isPatientReportsTab, token]);

  async function action(callback, successMessage) {
    setWorking(true); setError("");
    try { await callback(); await reload(token); if (successMessage) setNotice(successMessage); return true; }
    catch (reason) { setError(reason.message); return false; }
    finally { setWorking(false); }
  }

  async function book(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = Object.fromEntries(new FormData(formElement));
    if (await action(() => api("/api/bookings", { token, method: "POST", body: JSON.stringify(form) }), "Test booked successfully.")) formElement.reset();
  }

  async function updateBooking(event, booking) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(() => api(`/api/bookings/${booking.id}`, { token, method: "PATCH", body: JSON.stringify({ status: form.get("status"), result: form.get("result") }) }), "Sample progress updated.");
  }

  async function uploadReport(event, booking) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(() => api(`/api/reports/${booking.id}/pdf`, { token, method: "POST", body: form }), "Report saved and ready for download.");
  }

  async function addDoctor(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (await action(() => api("/api/admin/doctors", { token, method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(formElement))) }), "Doctor added.")) formElement.reset();
  }

  async function addTest(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (await action(() => api("/api/admin/tests", { token, method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(formElement))) }), "Test and cost added.")) formElement.reset();
  }

  async function addStaff(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (await action(() => api("/api/admin/users", { token, method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(formElement))) }), "Staff account created.")) formElement.reset();
  }

  async function registerPatient(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (await action(() => api("/api/reception/patients", { token, method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(formElement))) }), "Patient registered.")) formElement.reset();
  }

  async function updateTestCost(event, test) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(() => api(`/api/admin/tests/${test.id}`, { token, method: "PATCH", body: JSON.stringify({ price: form.get("price") }) }), "Test cost updated.");
  }

  async function downloadReport(report) {
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/reports/${report.id}/download`), { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json()).error || "Report download failed.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `${report.testName}-report.pdf`; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason.message); }
  }

  const tabs = user.role === "admin" ? ["overview", "bookings", "tests & costs", "doctors", "people"]
    : user.role === "technician" ? ["overview", "samples"]
      : user.role === "receptionist" ? ["overview", "register patient", "book test", "patients"]
        : user.role === "doctor" ? ["overview", "patients", "request test"]
          : ["overview", "book test", "my reports", "profile"];
  const shownBookings = isPatientReportsTab ? bookings.filter((booking) => booking.report) : bookings;

  return <section className="dashboard section">
    <div className="dashboard-heading"><div><span className="eyebrow">{roleLabels[user.role]} WORKSPACE</span><h1>Hello, {user.name.split(" ")[0]}.</h1><p>Here's your CareLab overview and the tools for your role.</p></div><button className="button button-light" onClick={() => reload(token)}>↻ Refresh</button></div>
    <div className="dashboard-shell"><aside className="side-nav"><div className="side-user"><div className="user-avatar">{user.name[0]}</div><div><b>{user.name}</b><small>{roleLabels[user.role]}</small></div></div>{tabs.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item === "overview" ? "⌂" : item === "samples" ? "◉" : item === "my reports" ? "▤" : "✳"} &nbsp; {item}</button>)}</aside>
      <div className="dashboard-content">
        <div className="dashboard-stats"><Stat label="Total bookings" value={bookings.length} /><Stat label="In progress" value={bookings.filter((booking) => booking.status === "Processing" || booking.status === "Collected").length} /><Stat label="Reports ready" value={bookings.filter((booking) => booking.report).length} /></div>
        {(tab === "overview" || tab === "patients" || tab === "my reports" || tab === "samples" || tab === "bookings") && <><div className="content-title"><div><h2>{tab === "bookings" ? "All patient bookings" : tab === "samples" ? "Sample workflow" : tab === "my reports" ? "Reports available to download" : tab === "patients" ? "Patient bookings" : user.role === "technician" ? "Samples to process" : "Recent activity"}</h2><p>{tab === "my reports" ? "Newly uploaded reports appear here automatically." : user.role === "patient" ? "Track your bookings and download completed reports." : user.role === "admin" ? "Monitor and update every booking's progress status." : "Review test bookings and their latest status."}</p></div>{["patient", "doctor", "receptionist"].includes(user.role) && <button className="button button-dark" onClick={() => setTab(user.role === "doctor" ? "request test" : "book test")}>+ Book a test</button>}</div><Bookings bookings={shownBookings} user={user} working={working} updateBooking={updateBooking} uploadReport={uploadReport} downloadReport={downloadReport} emptyTitle={tab === "my reports" ? "No reports uploaded yet" : "No bookings yet"} emptyMessage={tab === "my reports" ? "Your reports will appear here as soon as the lab uploads them." : "New tests will appear here as soon as they're booked."} /></>}
        {(tab === "book test" || tab === "request test") && <><div className="content-title"><div><h2>{tab === "request test" ? "Request a patient test" : "Book a lab test"}</h2><p>Choose a patient, test and preferred date.</p></div></div><form className="inline-form" onSubmit={book}>{user.role !== "patient" && <label>Patient<select name="patientId" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.phone}</option>)}</select></label>}<label>Test<select name="testId" required defaultValue=""><option value="" disabled>Select test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.name} · ₹{test.price}</option>)}</select></label><label>Preferred date<input type="date" name="date" required min={new Date().toISOString().slice(0, 10)} /></label><button className="button button-dark" disabled={working}>Confirm booking ↗</button></form></>}
        {tab === "register patient" && <><div className="content-title"><div><h2>Register a patient</h2><p>Create a patient account for test booking.</p></div></div><form className="inline-form" onSubmit={registerPatient}><label>Full name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" type="tel" required /></label><label>Temporary password<input name="password" type="password" minLength="8" required /></label><button className="button button-dark" disabled={working}>Register patient</button></form></>}
        {tab === "profile" && <><div className="content-title"><div><h2>Your profile</h2><p>Your registered CareLab account information.</p></div></div><div className="profile-card"><b>{user.name}</b><span>{user.email}</span><span>{user.phone}</span><span>Role: {roleLabels[user.role]}</span></div></>}
        {tab === "people" && <><div className="content-title"><div><h2>People & roles</h2><p>Create accounts for doctors, technicians and receptionists.</p></div></div><form className="inline-form" onSubmit={addStaff}><label>Full name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" type="tel" required /></label><label>Role<select name="role" defaultValue="technician"><option value="doctor">Doctor</option><option value="technician">Lab Technician</option><option value="receptionist">Receptionist</option></select></label><label>Specialization<input name="specialization" placeholder="For doctors" /></label><label>Initial password<input name="password" type="password" minLength="8" required /></label><button className="button button-dark" disabled={working}>Create account</button></form><div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead><tbody>{users.map((person) => <tr key={person.id}><td>{person.name}</td><td>{roleLabels[person.role]}</td><td>{person.email}</td><td>{person.phone}</td></tr>)}</tbody></table></div></>}
        {tab === "doctors" && <><div className="content-title"><div><h2>Doctor directory</h2><p>Manage the specialists shown to patients.</p></div></div><form className="inline-form" onSubmit={addDoctor}><label>Doctor name<input name="name" required /></label><label>Specialization<input name="specialization" required /></label><label>Phone<input name="phone" required type="tel" /></label><button className="button button-dark" disabled={working}>Add doctor</button></form><div className="doctor-grid compact">{doctors.map((doctor) => <div className="managed-doctor" key={doctor.id}><DoctorCard doctor={doctor} /><button className="small-action danger" disabled={working} onClick={() => action(() => api(`/api/admin/doctors/${doctor.id}`, { token, method: "DELETE" }), "Doctor removed.")}>Remove</button></div>)}</div></>}
        {tab === "tests & costs" && <><div className="content-title"><div><h2>Tests & costs</h2><p>Add and manage available lab tests.</p></div></div><form className="inline-form" onSubmit={addTest}><label>Test name<input name="name" required /></label><label>Category<input name="category" required placeholder="Blood, Urine…" /></label><label>Cost (₹)<input name="price" required type="number" min="0" /></label><button className="button button-dark" disabled={working}>Add test</button></form><div className="table-wrap"><table><thead><tr><th>Test</th><th>Category</th><th>Cost (₹)</th><th>Actions</th></tr></thead><tbody>{tests.map((test) => <tr key={test.id}><td>{test.name}</td><td>{test.category}</td><td><form className="cost-form" onSubmit={(event) => updateTestCost(event, test)}><input name="price" type="number" min="0" required defaultValue={test.price} aria-label={`${test.name} cost`} /><button className="small-action" disabled={working}>Save cost</button></form></td><td><button className="small-action danger" disabled={working} onClick={() => action(() => api(`/api/admin/tests/${test.id}`, { token, method: "DELETE" }), "Test removed.")}>Remove</button></td></tr>)}</tbody></table></div></>}
        {tab === "patients" && user.role === "receptionist" && <><div className="content-title"><div><h2>Registered patients</h2><p>Patient contact details for booking assistance.</p></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id}><td>{patient.name}</td><td>{patient.email}</td><td>{patient.phone}</td></tr>)}</tbody></table></div></>}
      </div>
    </div>
  </section>;
}

function Stat({ label, value }) {
  return <div className="stat-card"><span>{label}</span><b>{value}</b></div>;
}

function Bookings({ bookings, user, working, updateBooking, uploadReport, downloadReport, emptyTitle = "No bookings yet", emptyMessage = "New tests will appear here as soon as they're booked." }) {
  if (!bookings.length) return <div className="empty-card"><span>✳</span><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div>;
  return <div className="booking-list">{bookings.map((booking) => <article className="booking-card" key={booking.id}>        <div className="booking-main"><span className={`status status-${booking.status.toLowerCase()}`}>{booking.status}</span><h3>{booking.testName}</h3><p>{booking.patient?.name ? `${booking.patient.name} · ` : ""}{new Date(`${booking.date}T00:00:00`).toLocaleDateString()} · {booking.patient?.phone || ""}</p>{booking.report && <div className="report-info"><b>Report ID: {booking.report.id}</b><span>Result: {booking.report.result}</span><span>Technician: {booking.report.technicianName}</span>{booking.report.updatedByName && <span>Updated by: {booking.report.updatedByName}</span>}<span>Date: {new Date(booking.report.date).toLocaleDateString()}</span>{user.role !== "admin" && <button className="text-link" onClick={() => downloadReport(booking.report)}>Download report ↓</button>}</div>}</div>
  {["technician", "admin"].includes(user.role) && <div className="technician-actions"><form onSubmit={(event) => updateBooking(event, booking)}><label>Status<select name="status" defaultValue={booking.status}>{(user.role === "admin" ? ["Booked", "Collected", "Processing", "Done"] : ["Collected", "Processing", "Done"]).map((status) => <option key={status}>{status}</option>)}</select></label><label>Result<input name="result" defaultValue={booking.result} placeholder="Enter test result" /></label><button className="button button-dark" disabled={working}>Update progress</button></form>{(user.role === "technician" || user.role === "admin") && <form className="upload-form" onSubmit={(event) => uploadReport(event, booking)}><label>Upload report PDF<input type="file" name="report" accept="application/pdf,.pdf" required /></label><button className="button button-light" disabled={working}>Upload PDF</button></form>}</div>}
  </article>)}</div>;
}

function Footer({ navigate }) {
  return <footer className="footer"><div className="footer-top"><div><a className="brand footer-brand" href="#home" onClick={() => navigate("home")}><span className="brand-mark">✚</span> care<span>lab</span></a><p>Better diagnostics.<br />More confident care.</p></div><div><b>Explore</b><button onClick={() => navigate("about")}>About us</button><button onClick={() => navigate("tests")}>Our tests</button><button onClick={() => navigate("doctors")}>Doctors</button></div><div><b>Visit us</b><span>CareLab Diagnostics, Main Road</span><span>Pune, Maharashtra 411001</span><span>Mon – Sat, 7:00 AM – 8:00 PM</span></div><div><b>Contact</b><span>+91 20 4000 1234</span><button onClick={() => navigate("contact")}>Send us a message ↗</button></div></div><div className="footer-bottom"><span>© 2026 CareLab Diagnostics. Built around your care.</span><span>Accurate reports. Faster care.</span></div></footer>;
}

export default App;
