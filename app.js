// === CONFIGURE THESE ===
const WAREHOUSE_EMAIL = "amssupply@outlook.com";
const COMPANY_NAME = "AMS Supply";
const STORAGE_KEY = "ams_customer_quotes_v1"; // wrapper with .customers
// =======================

let ITEMS = [];

// CUSTOMER_QUOTES = {
//   normalizedName: {
//     displayName: "ABC Trucking",
//     items: { code: { name,uom,code,price } }
//   }
// }
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
  if (
    name.length >= suffix.length &&
    name.lastIndexOf(suffix) === name.length - suffix.length
  ) {
    name = name.substring(0, name.length - suffix.length);
  }
  name = name.replace(/\s{2,}/g, " ");
  return trimString(name);
}

// ---------- Storage ----------

function safeLoadCustomerQuotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.customers && typeof data.customers === "object") {
      CUSTOMER_QUOTES = data.customers;
      return;
    }
    if (data && typeof data === "object") {
      // old format fallback
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
      customers: CUSTOMER_QUOTES
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapper));
  } catch (e) {
    console.log("Could not save customer quotes:", e);
  }
}

// ---------- Items table ----------

function buildItemsTable(customer) {
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const indices = ITEMS.map((_, i) => i);

  const quoteMap = (customer && customer.items) ? customer.items : null;

  indices.sort((a, b) => {
    const ia = ITEMS[a] || {};
    const ib = ITEMS[b] || {};

    const codeA = (ia.code || "").toUpperCase();
    const codeB = (ib.code || "").toUpperCase();

    const inQuoteA = !!(quoteMap && ia.code && quoteMap[ia.code]);
    const inQuoteB = !!(quoteMap && ib.code && quoteMap[ib.code]);

    // Quoted items first
    if (inQuoteA && !inQuoteB) return -1;
    if (!inQuoteA && inQuoteB) return 1;

    // Then by code
    if (codeA < codeB) return -1;
    if (codeA > codeB) return 1;

    // Fallback: name
    const nameA = (ia.name || "").toLowerCase();
    const nameB = (ib.name || "").toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  let seenQuoted = false;
  let dividerInserted = false;

  indices.forEach(i => {
    const item = ITEMS[i];
    if (!item) return;

    const inQuote = !!(quoteMap && item.code && quoteMap[item.code]);

    // Divider row between quoted and non-quoted
    if (!inQuote && seenQuoted && !dividerInserted) {
      const divRow = document.createElement("tr");
      divRow.className = "items-divider-row";
      const divCell = document.createElement("td");
      divCell.colSpan = 5;
      divCell.textContent = "Previously Purchased";
      divRow.appendChild(divCell);
      tbody.appendChild(divRow);
      dividerInserted = true;
    }

    if (inQuote) {
      seenQuoted = true;
    }

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

    // Qty + Price group (single cell)
    const qtyPriceCell = document.createElement("td");
    const group = document.createElement("div");
    group.className = "qty-price-group";

    // Qty part
    const qtyWrap = document.createElement("div");
    const qtyLabel = document.createElement("label");
    qtyLabel.textContent = "Qty:";
    qtyLabel.setAttribute("for", "itemQty_" + i);
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.step = "1";
    qtyInput.disabled = true;
    qtyInput.id = "itemQty_" + i;

    qtyWrap.appendChild(qtyLabel);
    qtyWrap.appendChild(qtyInput);

    // Price part
    const priceWrap = document.createElement("div");
    const priceLabel = document.createElement("label");
    priceLabel.textContent = "Price:";
    priceLabel.setAttribute("for", "itemPrice_" + i);
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.inputMode = "decimal";
    priceInput.id = "itemPrice_" + i;

    priceWrap.appendChild(priceLabel);
    priceWrap.appendChild(priceInput);

    group.appendChild(qtyWrap);
    group.appendChild(priceWrap);
    qtyPriceCell.appendChild(group);

    row.appendChild(checkCell);
    row.appendChild(nameCell);
    row.appendChild(codeCell);
    row.appendChild(uomCell);
    row.appendChild(qtyPriceCell);

    tbody.appendChild(row);
  });

  // Checkbox → qty enable/disable
  const allCheckboxes = tbody.querySelectorAll("input[type=checkbox]");
  allCheckboxes.forEach(cb => {
    cb.onchange = function () {
      const qtyId = this.getAttribute("data-qty-id");
      const input = document.getElementById(qtyId);
      if (!input) return;
      if (this.checked) {
        input.disabled = false;
      } else {
        input.disabled = true;
        input.value = "";
      }
    };
  });

  // Apply existing prices
  if (customer && customer.items) {
    applyMasterQuoteToTable(customer);
  } else if (CURRENT_CUSTOMER_KEY && CUSTOMER_QUOTES[CURRENT_CUSTOMER_KEY]) {
    applyMasterQuoteToTable(CUSTOMER_QUOTES[CURRENT_CUSTOMER_KEY]);
  }
}

function applyMasterQuoteToTable(customer) {
  if (!customer || !customer.items) return;
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;

  const rows = tbody.getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.classList.contains("items-divider-row")) continue;
    const cells = row.getElementsByTagName("td");
    if (cells.length < 5) continue;
    const code = (cells[2].textContent || "").trim();
    if (!code) continue;
    const itemQuote = customer.items[code];
    if (!itemQuote) continue;
    const qtyPriceCell = cells[4];
    const priceInput = qtyPriceCell.querySelector("#itemPrice_" + i);
    if (priceInput) {
      priceInput.value = (itemQuote.price != null ? itemQuote.price : "");
    }
  }
}

// ---------- Master quote display ----------

function renderMasterQuote(cust) {
  const card = document.getElementById("masterQuoteCard");
  const note = document.getElementById("masterQuoteNote");
  const tbody = document.getElementById("masterQuoteBody");
  if (!card || !note || !tbody) return;

  if (!cust || !cust.items || Object.keys(cust.items).length === 0) {
    card.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  card.style.display = "block";
  note.textContent = "Pricing stored for " + (cust.displayName || "this customer") + ".";
  tbody.innerHTML = "";

  const codes = Object.keys(cust.items).sort();
  codes.forEach(code => {
    const it = cust.items[code];
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = it.name || "";

    const codeCell = document.createElement("td");
    codeCell.textContent = it.code || code;

    const uomCell = document.createElement("td");
    uomCell.textContent = it.uom || "";

    const priceCell = document.createElement("td");
    priceCell.textContent =
      (it.price != null && it.price !== "") ? ("$" + Number(it.price).toFixed(2)) : "";

    row.appendChild(nameCell);
    row.appendChild(codeCell);
    row.appendChild(uomCell);
    row.appendChild(priceCell);
    tbody.appendChild(row);
  });
}

// ---------- Customer suggestions ----------

function updateCustomerSuggestions(query) {
  const box = document.getElementById("customerSuggestions");
  if (!box) return;

  const term = trimString(query).toLowerCase();
  box.innerHTML = "";
  if (!term) {
    box.style.display = "none";
    return;
  }

  const matches = [];
  Object.keys(CUSTOMER_QUOTES).forEach(key => {
    const c = CUSTOMER_QUOTES[key];
    const name = (c.displayName || key || "").toLowerCase();
    if (name.indexOf(term) !== -1) {
      matches.push({ key, displayName: c.displayName || key });
    }
  });

  if (matches.length === 0) {
    box.style.display = "none";
    return;
  }

  matches.sort((a, b) => {
    const an = a.displayName.toLowerCase();
    const bn = b.displayName.toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  matches.forEach(m => {
    const div = document.createElement("div");
    div.className = "customer-suggestion";
    div.textContent = m.displayName;
    div.onclick = function () {
      const input = document.getElementById("customerName");
      if (input) {
        input.value = m.displayName;
        box.style.display = "none";
        onCustomerNameChange();
      }
    };
    box.appendChild(div);
  });

  box.style.display = "block";
}

// ---------- Customer name change ----------

function onCustomerNameChange() {
  const input = document.getElementById("customerName");
  if (!input) return;
  const rawName = trimString(input.value);
  const key = normalizeCustomerName(rawName);
  CURRENT_CUSTOMER_KEY = key || null;

  const card = document.getElementById("masterQuoteCard");
  if (!key) {
    if (card) card.style.display = "none";
    buildItemsTable(null);
    return;
  }

  const existing = CUSTOMER_QUOTES[key];
  if (existing) {
    existing.displayName = existing.displayName || rawName;
    renderMasterQuote(existing);
    buildItemsTable(existing);
  } else {
    if (card) card.style.display = "none";
    buildItemsTable(null);
  }
}

// ---------- Search ----------

function setupItemSearch() {
  const searchInput = document.getElementById("itemSearch");
  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const term = trimString(this.value).toLowerCase();
    const tbody = document.getElementById("itemsTableBody");
    if (!tbody) return;

    const rows = tbody.getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (row.classList && row.classList.contains("items-divider-row")) {
        row.style.display = term ? "none" : "";
        continue;
      }

      const cells = row.getElementsByTagName("td");
      if (cells.length < 5) continue;
      const nameCell = cells[1];
      const codeCell = cells[2];
      const uomCell = cells[3];
      if (!nameCell || !uomCell) continue;

      const nameText = (nameCell.textContent || "").toLowerCase();
      const codeText = (codeCell.textContent || "").toLowerCase();
      const uomText = (uomCell.textContent || "").toLowerCase();

      if (
        !term ||
        nameText.indexOf(term) !== -1 ||
        codeText.indexOf(term) !== -1 ||
        uomText.indexOf(term) !== -1
      ) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    }
  });
}

// ---------- New customer section ----------

function setupNewCustomerSection() {
  const newCustomer = document.getElementById("newCustomer");
  const details = document.getElementById("newCustomerDetails");
  const billingSame = document.getElementById("billingSameAsShipping");
  const taxExempt = document.getElementById("taxExempt");
  const countyRow = document.getElementById("countyRow");

  function setDetailsVisibility() {
    if (newCustomer && newCustomer.checked) {
      details.style.display = "block";
    } else {
      details.style.display = "none";
    }
  }

  function setBillingSameState() {
    const shipAddr1 = document.getElementById("shipAddr1");
    const shipAddr2 = document.getElementById("shipAddr2");
    const shipCity = document.getElementById("shipCity");
    const shipState = document.getElementById("shipState");
    const shipZip = document.getElementById("shipZip");
    const shipContactName = document.getElementById("shipContactName");
    const shipContactPhone = document.getElementById("shipContactPhone");
    const shipContactEmail = document.getElementById("shipContactEmail");

    const billAddr1 = document.getElementById("billAddr1");
    const billAddr2 = document.getElementById("billAddr2");
    const billCity = document.getElementById("billCity");
    const billState = document.getElementById("billState");
    const billZip = document.getElementById("billZip");
    const billContactName = document.getElementById("billContactName");
    const billContactPhone = document.getElementById("billContactPhone");
    const billContactEmail = document.getElementById("billContactEmail");

    if (!billAddr1 || !billAddr2 || !billCity || !billState || !billZip ||
        !billContactName || !billContactPhone || !billContactEmail) return;

    if (billingSame && billingSame.checked) {
      billAddr1.value = shipAddr1.value;
      billAddr2.value = shipAddr2.value;
      billCity.value = shipCity.value;
      billState.value = shipState.value;
      billZip.value = shipZip.value;
      billContactName.value = shipContactName.value;
      billContactPhone.value = shipContactPhone.value;
      billContactEmail.value = shipContactEmail.value;
    }
  }

  function setTaxState() {
    if (!taxExempt) return;
    if (taxExempt.checked) {
      countyRow.style.display = "none";
    } else {
      countyRow.style.display = "block";
    }
  }

  if (newCustomer) {
    newCustomer.addEventListener("change", setDetailsVisibility);
    setDetailsVisibility();
  }
  if (billingSame) {
    billingSame.addEventListener("change", setBillingSameState);
  }
  if (taxExempt) {
    taxExempt.addEventListener("change", setTaxState);
    setTaxState();
  }
}

function validateNewCustomerDetails() {
  const newCustomerBox = document.getElementById("newCustomer");
  if (!newCustomerBox || !newCustomerBox.checked) return true;

  function val(id) {
    const el = document.getElementById(id);
    return el ? trimString(el.value || "") : "";
  }

  const sAddr1 = val("shipAddr1");
  const sCity = val("shipCity");
  const sState = val("shipState");
  const sZip = val("shipZip");
  const sContactName = val("shipContactName");
  const sContactPhone = val("shipContactPhone");
  const sContactEmail = val("shipContactEmail");

  if (!sAddr1 || !sCity || !sState || !sZip || !sContactName || !sContactPhone || !sContactEmail) {
    alert("Please fill in all required shipping fields for the new customer.");
    return false;
  }

  const billingSame = document.getElementById("billingSameAsShipping");
  if (!billingSame || !billingSame.checked) {
    const bAddr1 = val("billAddr1");
    const bCity = val("billCity");
    const bState = val("billState");
    const bZip = val("billZip");
    const bContactName = val("billContactName");
    const bContactPhone = val("billContactPhone");
    const bContactEmail = val("billContactEmail");
    if (!bAddr1 || !bCity || !bState || !bZip || !bContactName || !bContactPhone || !bContactEmail) {
      alert("Please fill in all required billing fields for the new customer.");
      return false;
    }
  }

  const taxExempt = document.getElementById("taxExempt");
  const county = val("county");
  if (!taxExempt || !taxExempt.checked) {
    if (!county) {
      alert("Please enter the county for taxable customers.");
      return false;
    }
  }

  return true;
}

// ---------- Generate email / save quote ----------

function generateEmail() {
  const customerInput = document.getElementById("customerName");
  if (!customerInput) return;
  const customerName = trimString(customerInput.value);
  if (!customerName) {
    alert("Please enter a customer name.");
    return;
  }

  if (!validateNewCustomerDetails()) return;

  const key = normalizeCustomerName(customerName);
  if (!key) {
    alert("Customer name is invalid.");
    return;
  }

  const shipTo = trimString((document.getElementById("shipTo").value || ""));

  const lines = [];
  const custQuote = {
    displayName: customerName,
    items: {}
  };

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    if (!item) continue;

    const check = document.getElementById("itemCheck_" + i);
    if (!check || !check.checked) continue;

    const qtyInput = document.getElementById("itemQty_" + i);
    const priceInput = document.getElementById("itemPrice_" + i);
    if (!qtyInput) continue;

    const qty = parseInt(qtyInput.value, 10);
    if (!qty || qty <= 0) {
      alert("Please enter a quantity for all selected items.");
      return;
    }

    let price = 0;
    if (priceInput && priceInput.value !== "") {
      price = parseFloat(priceInput.value);
      if (isNaN(price) || price < 0) {
        alert("Please enter a valid price for all selected items.");
        return;
      }
    }

    const name = cleanName(item.name, item.uom);
    const code = item.code || "";
    const uom = item.uom || "";

    let line = "- " + qty + " x " + name;
    if (uom) line += " (" + uom + ")";
    if (code) line += " / " + code;
    if (priceInput && priceInput.value !== "") {
      line += " — $" + price.toFixed(2) + " each";
    }
    lines.push(line);

    if (code) {
      custQuote.items[code] = {
        name,
        uom,
        code,
        price: (priceInput && priceInput.value !== "") ? price : ""
      };
    }
  }

  if (lines.length === 0) {
    alert("Please select at least one item and enter quantities.");
    return;
  }

  // Save updated quotes & refresh UI
  CUSTOMER_QUOTES[key] = custQuote;
  safeSaveCustomerQuotes();
  renderMasterQuote(custQuote);
  buildItemsTable(custQuote);

  // Build email
  let subject = "Order for " + customerName;

  let body = "New order for customer: " + customerName + "\n\n";
  body += "Please pick and pack the following:\n\n";
  body += lines.join("\n") + "\n\n";

  if (shipTo) {
    body += "Ship To / Notes:\n" + shipTo + "\n\n";
  }

  // Account details (not saved, only in email)
  const newCustomerBox = document.getElementById("newCustomer");
  if (newCustomerBox && newCustomerBox.checked) {
    function val2(id) {
      const el = document.getElementById(id);
      return el ? trimString(el.value || "") : "";
    }

    const billingSame2 = document.getElementById("billingSameAsShipping");

    // Shipping
    const sAddr1 = val2("shipAddr1");
    const sAddr2 = val2("shipAddr2");
    const sCity = val2("shipCity");
    const sState = val2("shipState");
    const sZip = val2("shipZip");
    const sContactName = val2("shipContactName");
    const sContactPhone = val2("shipContactPhone");
    const sContactEmail = val2("shipContactEmail");

    // Billing
    let bAddr1, bAddr2, bCity, bState, bZip;
    let bContactName, bContactPhone, bContactEmail;

    if (billingSame2 && billingSame2.checked) {
      bAddr1 = sAddr1;
      bAddr2 = sAddr2;
      bCity = sCity;
      bState = sState;
      bZip = sZip;
      bContactName = sContactName;
      bContactPhone = sContactPhone;
      bContactEmail = sContactEmail;
    } else {
      bAddr1 = val2("billAddr1");
      bAddr2 = val2("billAddr2");
      bCity = val2("billCity");
      bState = val2("billState");
      bZip = val2("billZip");
      bContactName = val2("billContactName");
      bContactPhone = val2("billContactPhone");
      bContactEmail = val2("billContactEmail");
    }

    const taxExempt2 = document.getElementById("taxExempt");
    const county2 = val2("county");

    body += "Customer account information:\n\n";

    body += "Shipping Address:\n";
    if (sAddr1) body += sAddr1 + "\n";
    if (sAddr2) body += sAddr2 + "\n";
    if (sCity || sState || sZip) {
      body += [sCity, sState, sZip].filter(p => p).join(", ") + "\n";
    }
    if (sContactName) body += "Contact Name: " + sContactName + "\n";
    if (sContactPhone) body += "Contact Phone: " + sContactPhone + "\n";
    if (sContactEmail) body += "Contact Email: " + sContactEmail + "\n";
    body += "\n";

    body += "Billing Address:\n";
    if (bAddr1) body += bAddr1 + "\n";
    if (bAddr2) body += bAddr2 + "\n";
    if (bCity || bState || bZip) {
      body += [bCity, bState, bZip].filter(p => p).join(", ") + "\n";
    }
    if (bContactName) body += "Contact Name (AP): " + bContactName + "\n";
    if (bContactPhone) body += "Contact Phone (AP): " + bContactPhone + "\n";
    if (bContactEmail) body += "Contact Email (AP): " + bContactEmail + "\n";
    body += "\n";

    body += "Tax Exempt Status: " + (taxExempt2 && taxExempt2.checked ? "Tax Exempt" : "Taxable") + "\n";
    if (!(taxExempt2 && taxExempt2.checked) && county2) {
      body += "County: " + county2 + "\n";
    }
    body += "\n";
  }

  body += "Thank you,\n" + COMPANY_NAME + "\n";

  const mailto = "mailto:" + encodeURIComponent(WAREHOUSE_EMAIL)
    + "?subject=" + encodeURIComponent(subject)
    + "&body=" + encodeURIComponent(body);

  window.location.href = mailto;
}

// ---------- Export / Import ----------

function exportCustomerData() {
  try {
    const data = {
      type: "ams_customer_db",
      version: 1,
      customers: CUSTOMER_QUOTES
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ams_customer_data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.log("Export failed:", e);
    alert("Could not export customer data.");
  }
}

function handleImportFileChange(evt) {
  const input = evt.target;
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);
      let newMap = {};

      if (data && typeof data === "object") {
        if (data.customers && typeof data.customers === "object") {
          newMap = data.customers;
        } else {
          newMap = data;
        }
      }

      CUSTOMER_QUOTES = newMap;
      safeSaveCustomerQuotes();
      alert("Customer data imported successfully.");

      buildManageCustomersTable();
      const nameInput = document.getElementById("customerName");
      if (nameInput && trimString(nameInput.value)) {
        onCustomerNameChange();
      } else {
        const card = document.getElementById("masterQuoteCard");
        if (card) card.style.display = "none";
        buildItemsTable(null);
      }
    } catch (err) {
      console.log("Import error:", err);
      alert("Could not import file. Make sure it's a valid export from this app.");
    } finally {
      input.value = "";
    }
  };
  reader.readAsText(file);
}

// ---------- Manage customers overlay ----------

function openManageCustomers() {
  const overlay = document.getElementById("manageCustomersOverlay");
  if (!overlay) return;
  buildManageCustomersTable();
  hideEditCustomerSection();
  overlay.style.display = "flex";
}

function closeManageCustomers() {
  const overlay = document.getElementById("manageCustomersOverlay");
  if (!overlay) return;
  overlay.style.display = "none";
}

function hideEditCustomerSection() {
  const sec = document.getElementById("editCustomerSection");
  if (sec) sec.style.display = "none";
  EDITING_CUSTOMER_KEY = null;
  const tbody = document.getElementById("editCustomerBody");
  if (tbody) tbody.innerHTML = "";
}

function buildManageCustomersTable() {
  const tbody = document.getElementById("manageCustomersBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const keys = Object.keys(CUSTOMER_QUOTES).sort((a, b) => {
    const an = (CUSTOMER_QUOTES[a].displayName || "").toLowerCase();
    const bn = (CUSTOMER_QUOTES[b].displayName || "").toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  if (keys.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No customers saved yet.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  keys.forEach(key => {
    const cust = CUSTOMER_QUOTES[key];
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = cust.displayName || key;

    const itemsCount = cust.items ? Object.keys(cust.items).length : 0;
    const countCell = document.createElement("td");
    countCell.textContent = itemsCount;

    const actionsCell = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "small-btn";
    editBtn.style.marginRight = "0.25rem";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      openEditCustomer(key);
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "small-btn";
    delBtn.textContent = "Delete";
    delBtn.onclick = function () {
      if (confirm(`Delete customer "${cust.displayName || key}" and all stored pricing?`)) {
        delete CUSTOMER_QUOTES[key];
        safeSaveCustomerQuotes();
        buildManageCustomersTable();
        if (CURRENT_CUSTOMER_KEY === key) {
          CURRENT_CUSTOMER_KEY = null;
          const card = document.getElementById("masterQuoteCard");
          if (card) card.style.display = "none";
          buildItemsTable(null);
        }
        if (EDITING_CUSTOMER_KEY === key) {
          hideEditCustomerSection();
        }
      }
    };

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(delBtn);

    row.appendChild(nameCell);
    row.appendChild(countCell);
    row.appendChild(actionsCell);

    tbody.appendChild(row);
  });
}

function openEditCustomer(key) {
  const cust = CUSTOMER_QUOTES[key];
  if (!cust || !cust.items) return;
  EDITING_CUSTOMER_KEY = key;

  const sec = document.getElementById("editCustomerSection");
  const nameSpan = document.getElementById("editCustomerName");
  const tbody = document.getElementById("editCustomerBody");
  if (!sec || !nameSpan || !tbody) return;

  nameSpan.textContent = cust.displayName || key;
  tbody.innerHTML = "";

  const codes = Object.keys(cust.items).sort();
  codes.forEach(code => {
    const it = cust.items[code];
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = it.name || "";

    const codeCell = document.createElement("td");
    codeCell.textContent = it.code || code;

    const priceCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.inputMode = "decimal";
    input.value = (it.price != null && it.price !== "") ? it.price : "";
    priceCell.appendChild(input);

    const removeCell = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "small-btn";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = function () {
      row.parentNode.removeChild(row);
    };
    removeCell.appendChild(removeBtn);

    row.appendChild(nameCell);
    row.appendChild(codeCell);
    row.appendChild(priceCell);
    row.appendChild(removeCell);
    tbody.appendChild(row);
  });

  sec.style.display = "block";
}

function saveEditedCustomerQuote() {
  if (!EDITING_CUSTOMER_KEY || !CUSTOMER_QUOTES[EDITING_CUSTOMER_KEY]) return;
  const cust = CUSTOMER_QUOTES[EDITING_CUSTOMER_KEY];
  const tbody = document.getElementById("editCustomerBody");
  if (!tbody) return;

  const rows = tbody.getElementsByTagName("tr");
  const newItems = {};
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    if (cells.length < 3) continue;
    const name = trimString(cells[0].textContent || "");
    const code = trimString(cells[1].textContent || "");
    const input = cells[2].querySelector("input[type=number]");
    const priceVal = input ? trimString(input.value || "") : "";
    const price = priceVal === "" ? "" : parseFloat(priceVal);
    if (!code) continue;
    newItems[code] = {
      name,
      code,
      uom: (cust.items[code] && cust.items[code].uom) || "",
      price
    };
  }

  cust.items = newItems;
  safeSaveCustomerQuotes();
  alert("Master quote updated.");

  if (CURRENT_CUSTOMER_KEY === EDITING_CUSTOMER_KEY) {
    renderMasterQuote(cust);
    buildItemsTable(cust);
  }

  hideEditCustomerSection();
}

function cancelEditCustomer() {
  hideEditCustomerSection();
}

// ---------- Init ----------

function setupCustomerNameWatcher() {
  const input = document.getElementById("customerName");
  if (!input) return;

  input.addEventListener("change", onCustomerNameChange);
  input.addEventListener("input", function () {
    updateCustomerSuggestions(this.value);
  });

  if (trimString(input.value)) {
    onCustomerNameChange();
  }
}

function initPage() {
  buildItemsTable(null);
  setupItemSearch();
  setupNewCustomerSection();
  setupCustomerNameWatcher();

  const importInput = document.getElementById("importFile");
  if (importInput) {
    importInput.addEventListener("change", handleImportFileChange);
  }
}

function loadItemsAndInit() {
  safeLoadCustomerQuotes();

  if (typeof fetch === "function") {
    fetch("items.json")
      .then(response => response.json())
      .then(data => {
        if (Array.isArray(data)) {
          ITEMS = data;
        } else {
          ITEMS = [];
        }
        initPage();
      })
      .catch(err => {
        console.log("Could not load items.json:", err);
        ITEMS = [];
        initPage();
      });
  } else {
    ITEMS = [];
    initPage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadItemsAndInit);
} else {
  loadItemsAndInit();
}

// Register service worker (optional PWA)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .catch(function (err) {
      console.log("Service worker registration failed:", err);
    });
}
