import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Box,
  TextField,
  Button,
  IconButton,
  Snackbar,
  Alert,
  Grid,
  Divider,
  Chip,
  Tooltip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Drawer,
  Badge,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardActions,
  Switch,
  FormControlLabel
} from "@mui/material";
import { ContentCopy, BarChart, Link as LinkIcon, Refresh, DeleteOutline, History, Troubleshoot, Info } from "@mui/icons-material";

// -----------------------------
//  Simple in-app Logging Middleware
// -----------------------------
// Using a custom logger (not console) as required by the brief. All logs are persisted to localStorage
// and viewable via the Log Drawer. This acts like a lightweight middleware for client actions.
const LOG_STORE_KEY = "am_url_shortener_logs_v1";

const Logger = {
  write(event, payload = {}) {
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      event,
      payload
    };
    try {
      const raw = localStorage.getItem(LOG_STORE_KEY);
      const prev = raw ? JSON.parse(raw) : [];
      prev.unshift(entry);
      localStorage.setItem(LOG_STORE_KEY, JSON.stringify(prev.slice(0, 1000))); // cap
    } catch (_) {}
  },
  read() {
    try {
      const raw = localStorage.getItem(LOG_STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },
  clear() {
    localStorage.removeItem(LOG_STORE_KEY);
  }
};

// -----------------------------
//  Storage helpers
// -----------------------------
const STORE_KEY = "am_url_shortener_store_v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { items: [] };
  } catch (e) {
    return { items: [] };
  }
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// -----------------------------
//  Utilities
// -----------------------------
const isValidUrl = (str) => {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
};

const isValidShort = (s) => /^[a-zA-Z0-9]{3,15}$/.test(s || "");

const base62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const genCode = (len = 7) => Array.from({ length: len }, () => base62[Math.floor(Math.random() * base62.length)]).join("");

const nowIso = () => new Date().toISOString();

function minutesFromNow(min) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + min);
  return d.toISOString();
}

function isExpired(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

// derive a coarse location without external APIs (no PII): language + timezone
function getCoarseLocation() {
  return {
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
}

// -----------------------------
//  Data model
// -----------------------------
// ShortItem = {
//   id, shortcode, longUrl, createdAt, expireAt, clicks: [{ts, ref, coarse: {lang, tz}, sourcePath}],
// }

function useStore() {
  const [store, setStore] = useState(loadStore());
  useEffect(() => saveStore(store), [store]);
  return [store, setStore];
}

// -----------------------------
//  URL Shortener Page
// -----------------------------
function ShortenerPage() {
  const [store, setStore] = useStore();
  const [rows, setRows] = useState([
    { longUrl: "", minutes: "", shortcode: "" },
  ]);
  const [snack, setSnack] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const addRow = () => setRows((r) => (r.length >= 5 ? r : [...r, { longUrl: "", minutes: "", shortcode: "" }]));
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  const handleChange = (i, key, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const createShort = () => {
    // Validate client-side according to constraints
    const existingCodes = new Set(store.items.map((x) => x.shortcode));
    const newItems = [];

    for (let i = 0; i < rows.length; i++) {
      const { longUrl, minutes, shortcode } = rows[i];

      if (!longUrl || !isValidUrl(longUrl)) {
        setSnack({ type: "error", msg: `Row ${i + 1}: Invalid URL.` });
        Logger.write("validation_error", { row: i + 1, reason: "invalid_url", value: longUrl });
        return;
      }

      let mins = 30; // default validity
      if (minutes !== "" && minutes !== null) {
        const n = Number(minutes);
        if (!Number.isInteger(n) || n <= 0) {
          setSnack({ type: "error", msg: `Row ${i + 1}: Validity must be a positive integer (minutes).` });
          Logger.write("validation_error", { row: i + 1, reason: "invalid_validity", value: minutes });
          return;
        }
        mins = n;
      }

      let code = shortcode?.trim();
      if (code) {
        if (!isValidShort(code)) {
          setSnack({ type: "error", msg: `Row ${i + 1}: Shortcode must be 3-15 alphanumeric characters.` });
          Logger.write("validation_error", { row: i + 1, reason: "invalid_shortcode", value: code });
          return;
        }
        if (existingCodes.has(code)) {
          setSnack({ type: "error", msg: `Row ${i + 1}: Shortcode already exists. Choose another.` });
          Logger.write("validation_error", { row: i + 1, reason: "collision", value: code });
          return;
        }
      } else {
        // auto-generate unique
        code = genCode(7);
        while (existingCodes.has(code)) code = genCode(7);
      }

      existingCodes.add(code);
      const item = {
        id: crypto.randomUUID(),
        shortcode: code,
        longUrl,
        createdAt: nowIso(),
        expireAt: minutesFromNow(mins),
        clicks: [],
      };
      newItems.push(item);
      Logger.write("short_created", { shortcode: code, longUrl, minutes: mins });
    }

    if (newItems.length) {
      setStore((s) => ({ items: [...newItems, ...s.items] }));
      setShowResults(true);
      setSnack({ type: "success", msg: `${newItems.length} short link(s) created.` });
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setSnack({ type: "success", msg: "Copied!" }); Logger.write("copied", { text }); } catch (e) { setSnack({ type: "error", msg: "Copy failed." }); }
  };

  const host = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <Container maxWidth="lg" sx={{ my: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5">URL Shortener</Typography>
          <Box>
            <Button component={Link} to="/stats" startIcon={<BarChart />}>Statistics</Button>
          </Box>
        </Stack>

        <Alert icon={<Info fontSize="inherit" />} severity="info" sx={{ mb: 2 }}>
          Add up to 5 URLs at once. If no validity is set, default is 30 minutes.
        </Alert>

        <Stack spacing={2}>
          {rows.map((row, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Original Long URL" value={row.longUrl} onChange={(e) => handleChange(idx, "longUrl", e.target.value)} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth label="Validity (minutes)" value={row.minutes} onChange={(e) => handleChange(idx, "minutes", e.target.value)} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth label="Optional Shortcode (3-15 a-zA-Z0-9)" value={row.shortcode} onChange={(e) => handleChange(idx, "shortcode", e.target.value)} />
                </Grid>
                <Grid item xs={12} md={1}>
                  <Tooltip title="Remove row">
                    <span>
                      <IconButton disabled={rows.length === 1} onClick={() => removeRow(idx)}>
                        <DeleteOutline />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Grid>
              </Grid>
            </Paper>
          ))}
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={addRow} startIcon={<Refresh />}>Add Row</Button>
            <Button variant="contained" onClick={createShort} startIcon={<LinkIcon />}>Create Short Links</Button>
          </Stack>
        </Stack>

        {showResults && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Newly Created Links</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Short URL</TableCell>
                    <TableCell>Original URL</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {store.items.slice(0, rows.length).map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={`${host}/${it.shortcode}`} />
                          <IconButton size="small" onClick={() => copy(`${host}/${it.shortcode}`)}><ContentCopy fontSize="inherit" /></IconButton>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.longUrl}</TableCell>
                      <TableCell>{new Date(it.expireAt).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Button component={Link} to={`/r/${it.shortcode}`} size="small">Open</Button>
                        <Button component={Link} to={`/stats#${it.shortcode}`} size="small" startIcon={<BarChart />}>Stats</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      <LogDrawer />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack && <Alert severity={snack.type}>{snack.msg}</Alert>}
      </Snackbar>
    </Container>
  );
}

// -----------------------------
//  Stats Page
// -----------------------------
function StatsPage() {
  const [store, setStore] = useStore();
  const [query, setQuery] = useState("");
  const [snack, setSnack] = useState(null);
  const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";

  useEffect(() => {
    if (hash) setQuery(hash);
  }, [hash]);

  const filtered = useMemo(() => {
    return store.items.filter((x) => !query || x.shortcode.includes(query));
  }, [store, query]);

  const purgeExpired = () => {
    const live = store.items.filter((x) => !isExpired(x.expireAt));
    setStore({ items: live });
    setSnack({ type: "success", msg: "Expired links removed." });
    Logger.write("purge_expired", { before: store.items.length, after: live.length });
  };

  const host = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <Container maxWidth="lg" sx={{ my: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5">Statistics</Typography>
          <Button component={Link} to="/" variant="outlined">Shorten URLs</Button>
        </Stack>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Filter by shortcode" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Grid>
          <Grid item xs={12} md={6}>
            <Stack direction="row" spacing={2} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
              <Button variant="outlined" onClick={purgeExpired} startIcon={<History />}>Remove Expired</Button>
            </Stack>
          </Grid>
        </Grid>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Short URL</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell>Total Clicks</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((it) => (
                <TableRow key={it.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label={`${host}/${it.shortcode}`} />
                      <IconButton size="small" onClick={() => navigator.clipboard.writeText(`${host}/${it.shortcode}`)}><ContentCopy fontSize="inherit" /></IconButton>
                    </Stack>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>{it.longUrl}</Typography>
                  </TableCell>
                  <TableCell>{new Date(it.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(it.expireAt).toLocaleString()} {isExpired(it.expireAt) && <Chip color="error" size="small" label="expired" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell>{it.clicks.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ my: 3 }} />
        <Typography variant="h6" sx={{ mb: 1 }}>Click Details</Typography>
        <List dense>
          {filtered.flatMap((it) => (
            it.clicks.map((c, i) => (
              <ListItem key={`${it.id}-${i}`}>
                <ListItemText
                  primary={`${it.shortcode} · ${new Date(c.ts).toLocaleString()}`}
                  secondary={`referrer: ${c.ref || "(direct)"} · lang: ${c.coarse?.lang || ""} · tz: ${c.coarse?.tz || ""} · from: ${c.sourcePath || "/"}`}
                />
              </ListItem>
            ))
          ))}
        </List>
      </Paper>

      <LogDrawer />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack && <Alert severity={snack.type}>{snack.msg}</Alert>}
      </Snackbar>
    </Container>
  );
}

// -----------------------------
//  Redirect Route: /:code or /r/:code
// -----------------------------
function Redirector() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [store, setStore] = useStore();
  const [error, setError] = useState("");

  useEffect(() => {
    // Find item, check validity, push click, then redirect
    const item = store.items.find((x) => x.shortcode === code);
    if (!item) {
      setError("Shortcode not found.");
      Logger.write("redirect_failed", { code, reason: "not_found" });
      return;
    }
    if (isExpired(item.expireAt)) {
      setError("This link has expired.");
      Logger.write("redirect_failed", { code, reason: "expired" });
      return;
    }

    const click = {
      ts: nowIso(),
      ref: document.referrer || "",
      coarse: getCoarseLocation(),
      sourcePath: location?.state?.from || location?.pathname || "/",
    };

    const updated = store.items.map((x) => (x.shortcode === code ? { ...x, clicks: [click, ...x.clicks] } : x));
    setStore({ items: updated });
    Logger.write("redirect_click", { code });

    // Use replace to avoid keeping the short path in history
    setTimeout(() => {
      window.location.replace(item.longUrl);
    }, 400);
  }, [code]);

  return (
    <Container maxWidth="sm" sx={{ my: 6 }}>
      <Paper sx={{ p: 3, textAlign: "center" }}>
        {!error ? (
          <>
            <Typography variant="h6" gutterBottom>Redirecting…</Typography>
            <Typography variant="body2">You will be taken to the destination shortly.</Typography>
          </>
        ) : (
          <>
            <Typography variant="h6" color="error" gutterBottom>Cannot redirect</Typography>
            <Typography variant="body2">{error}</Typography>
            <Button sx={{ mt: 2 }} onClick={() => navigate("/")}>Go Home</Button>
          </>
        )}
      </Paper>
    </Container>
  );
}

// -----------------------------
//  Log Drawer UI
// -----------------------------
function LogDrawer() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(Logger.read());
  const refresh = () => setLogs(Logger.read());

  return (
    <>
      <Tooltip title="View internal logs (custom middleware)">
        <IconButton onClick={() => { refresh(); setOpen(true); }} sx={{ position: "fixed", right: 16, bottom: 16 }}>
          <Badge badgeContent={logs.length} color="primary">
            <Troubleshoot />
          </Badge>
        </IconButton>
      </Tooltip>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: 380 } }}>
        <Box sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">App Logs</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={refresh}>Refresh</Button>
              <Button size="small" color="error" onClick={() => { Logger.clear(); refresh(); }}>Clear</Button>
            </Stack>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <List dense>
            {logs.map((l) => (
              <ListItem key={l.id}>
                <ListItemText
                  primary={`${new Date(l.ts).toLocaleString()} · ${l.event}`}
                  secondary={JSON.stringify(l.payload)}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}

// -----------------------------
//  Shell
// -----------------------------
function Shell() {
  return (
    <BrowserRouter>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>AffordMed – React URL Shortener</Typography>
          <Button color="inherit" component={Link} to="/">Shorten</Button>
          <Button color="inherit" component={Link} to="/stats">Stats</Button>
        </Toolbar>
      </AppBar>
      <Routes>
        <Route path="/" element={<ShortenerPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/:code" element={<Redirector />} />
        <Route path="/r/:code" element={<Redirector />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <Container maxWidth="sm" sx={{ my: 6 }}>
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>404 – Not Found</Typography>
        <Typography variant="body2">The page you are looking for does not exist.</Typography>
        <Button sx={{ mt: 2 }} component={Link} to="/">Go Home</Button>
      </Paper>
    </Container>
  );
}

export default Shell;

