// Cleaned + optimized app.js with grouped Qty/Price layout support
// ---------------------------------------------------------------

// === CONFIGURE THESE ===
const WAREHOUSE_EMAIL = "amssupply@outlook.com";
const COMPANY_NAME = "AMS Supply";
const STORAGE_KEY = "ams_customer_quotes_v1";
// =======================

let ITEMS = [];
let CUSTOMER_QUOTES = {};
let CURRENT_CUSTOMER_KEY = null;
let EDITING_CUSTOMER_KEY = null;

// ---------- Helpers ----------
function trimString(str) {
  return (str || "").replace(/^\s+|\s+$/g, "");
}

function normalizeCustomerName(name) {
  return trimString(name).toLowerCase();
}

function cleanName(rawName, uom) {
  if (!rawName || !uom) return rawName || "";
  let name = rawName;
  const u = trimString(uom);
  const suffix = " (" + u + ")";
  if (name.endsWith(suffix)) {
    name = name.slice(0, -suffix.length);
  }
  return trimString(name.replace(/\s{2,}/g, " "));
}

// ---------- Storage ----------
function safeLoadCustomerQuotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.customers) {
      CUSTOMER_QUOTES = data.customers;
    } else if (typeof data === "object") {
      CUSTOMER_QUOTES = data;
    }
  } catch (e) {
    console.log("Could not load customer quotes:", e);
  }
}

function safeSaveCustomerQuotes() {
  try {
    const wrapper = {
      type: "ams_customer_db",
      version: 1,
      customers: CUSTOMER_QUOTES,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapper));
  } catch (e) {
    console.log("Could not save customer quotes:", e);
  }
}

// ---------- Items Table ----------
function buildItemsTable(customer) {
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const indices = ITEMS.map((_, i) => i);
  const quoteMap = customer?.items || null;

  // Sorting logic
  indices.sort((a, b) => {
    const ia = ITEMS[a] || {};
    const ib = ITEMS[b] || {};

    const codeA = (ia.code || "").toUpperCase();
    const codeB = (ib.code || "").toUpperCase();

    const inQuoteA = !!(quoteMap && ia.code && quoteMap[ia.code]);
    const inQuoteB = !!(quoteMap && ib.code && quoteMap[ib.code]);

    if (inQuoteA !== inQuoteB) return inQuoteA ? -1 : 1;
    if (codeA < codeB) return -1;
    if (codeA > codeB) return 1;
    return (ia.name || "").localeCompare(ib.name || "");
  });

  let seenQuoted = false;
  let dividerInserted = false;

  indices.forEach((i) => {
    const item = ITEMS[i];
    if (!item) return;

    const inQuote = !!(quoteMap && item.code && quoteMap[item.code]);

    // Divider row
    if (!inQuote && seenQuoted && !dividerInserted) {
      const divRow = document.createElement("tr");
      divRow.className = "items-divider-row";
      const divCell = document.createElement("td");
      divCell.colSpan = 6;
      divCell.textContent = "Previously Purchased";
      divRow.appendChild(divCell);
      tbody.appendChild(divRow);
      dividerInserted = true;
    }

    if (inQuote) seenQuoted = true;

    const row = document.createElement("tr");

    // Checkbox
    const checkCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "itemCheck_" + i;
    checkbox.setAttribute("data-qty-id", "itemQty_" + i);
    checkCell.appendChild(checkbox);

    // Name
    const nameCell = document.createElement("td");
    nameCell.textContent = cleanName(item.name, item.uom);

    // Code
    const codeCell = document.createElement("td");
    codeCell.textContent = item.code || "";

    // UOM
    const uomCell = document.createElement("td");
    uomCell.textContent = item.uom || "";

    // ===== Grouped Qty + Price cell =====
    const qpCell = document.createElement("td");
    qpCell.className = "qty-price-group";

    // Qty
    const qtyGroup = document.createElement("div");
    const qtyLabel = document.createElement("label");
    qtyLabel.textContent = "Qty:";
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.step = "1";
    qtyInput.disabled = true;
    qtyInput.id = "itemQty_" + i;
    qtyGroup.appendChild(qtyLabel);
    qtyGroup.appendChild(qtyInput);

    // Price
    const priceGroup = document.createElement("div");
    const priceLabel = document.createElement("label");
    priceLabel.textContent = "Price:";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.inputMode = "decimal";
    priceInput.id = "itemPrice_" + i;
    priceGroup.appendChild(priceLabel);
    priceGroup.appendChild(priceInput);

    qpCell.appendChild(qtyGroup);
    qpCell.appendChild(priceGroup);

    // Build row
    row.appendChild(checkCell);
    row.appendChild(nameCell);
    row.appendChild(codeCell);
    row.appendChild(uomCell);
    row.appendChild(qpCell);

    tbody.appendChild(row);
  });

  // Enable/disable quantity
  tbody.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.onchange = function () {
      const qtyId = this.getAttribute("data-qty-id");
      const input = document.getElementById(qtyId);
      if (this.checked) input.disabled = false;
      else {
        input.disabled = true;
        input.value = "";
      }
    };
  });

  // Apply existing master quote prices
  if (customer?.items) applyMasterQuoteToTable(customer);
  else if (CURRENT_CUSTOMER_KEY && CUSTOMER_QUOTES[CURRENT_CUSTOMER_KEY])
    applyMasterQuoteToTable(CUSTOMER_QUOTES[CURRENT_CUSTOMER_KEY]);
}

function applyMasterQuoteToTable(customer) {
  if (!customer?.items) return;
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;

  const rows = tbody.getElementsByTagName("tr");
  for (let row of rows) {
    if (row.classList.contains("items-divider-row")) continue;
    const cells = row.getElementsByTagName("td");
    if (cells.length < 5) continue;
    const code = cells[2].textContent.trim();
    if (!code) continue;
    const saved = customer.items[code];
    if (!saved) continue;
    const priceInput = cells[4].querySelectorAll("input[type=number]")[1];
    if (priceInput) priceInput.value = saved.price ?? "";
  }
}

// ---------- Master Quote Display ----------
function renderMasterQuote(cust) {
  const card = document.getElementById("masterQuoteCard");
  const note = document.getElementById("masterQuoteNote");
  const tbody = document.getElementById("masterQuoteBody");

  if (!cust || !cust.items || Object.keys(cust.items).length === 0) {
    card.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  card.style.display = "block";
  note.textContent = "Pricing stored for " + (cust.displayName || "this customer") + ".";
  tbody.innerHTML = "";

  Object.keys(cust.items)
    .sort()
    .forEach((code) => {
