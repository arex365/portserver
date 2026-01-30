(function () {
  const baseURL = "";
  const tableSelect = document.getElementById("tableSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");

  // fetch table names and populate dropdown
  async function loadTables() {
    try {
      const resp = await axios.get("/tables", { timeout: 5000 });
      if (resp && resp.data && Array.isArray(resp.data.tables)) {
        tableSelect.innerHTML = "";
        resp.data.tables.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          tableSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn("Could not load tables:", err.message || err);
    }
  }

  const coinInput = document.getElementById("coinInput");
  const statusSelect = document.getElementById("statusSelect");
  const fetchBtn = document.getElementById("fetchBtn");
  const clearBtn = document.getElementById("clearBtn");
  const updateProfitsBtn = document.getElementById("updateProfitsBtn");
  const recalculateHistoricalBtn = document.getElementById("recalculateHistoricalBtn");
  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
  const bestCoinsBtn = document.getElementById("bestCoinsBtn");
  const message = document.getElementById("message");
  const messageText = document.getElementById("messageText");
  const tableHead = document.getElementById("tableHead");
  const tableBody = document.getElementById("tableBody");
  const emptyState = document.getElementById("emptyState");
  const loadingSpinner = document.querySelector(".loading-spinner");

  function showMessage(txt, isLoading = false) {
    if (!txt) {
      message.classList.add("d-none");
      return;
    }

    messageText.textContent = txt;
    message.classList.remove(
      "d-none",
      "alert-danger",
      "alert-success",
      "alert-info"
    );
    message.classList.add("alert-info");

    if (loadingSpinner) {
      if (isLoading) {
        loadingSpinner.style.display = "inline-block";
      } else {
        loadingSpinner.style.display = "none";
      }
    }
  }

  function showError(txt) {
    messageText.textContent = txt;
    message.classList.remove("d-none", "alert-info", "alert-success");
    message.classList.add("alert-danger");
    loadingSpinner.style.display = "none";
  }

  function showSuccess(txt) {
    messageText.textContent = txt;
    message.classList.remove("d-none", "alert-info", "alert-danger");
    message.classList.add("alert-success");
    loadingSpinner.style.display = "none";
  }

  function clearTable() {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    emptyState.classList.add("d-none");
  }

  function formatCurrency(value) {
    if (typeof value !== "number") return value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatNumber(value, decimals = 2) {
    if (typeof value !== "number") return value;
    return value.toFixed(decimals);
  }

  function getStatusBadge(status) {
    const statusLower = (status || "").toLowerCase();
    if (statusLower === "open") {
      return `<span class="status-badge status-open"><i class="bi bi-circle-fill me-1"></i>Open</span>`;
    } else if (statusLower === "close") {
      return `<span class="status-badge status-close"><i class="bi bi-check-circle-fill me-1"></i>Closed</span>`;
    }
    return status;
  }

  function getPositionSideBadge(side) {
    const sideLower = (side || "").toLowerCase();
    if (sideLower === "long") {
      return `<span class="position-long"><i class="bi bi-arrow-up-circle-fill me-1"></i>Long</span>`;
    } else if (sideLower === "short") {
      return `<span class="position-short"><i class="bi bi-arrow-down-circle-fill me-1"></i>Short</span>`;
    }
    return side;
  }

  function getPnLClass(value) {
    if (typeof value !== "number") return "";
    return value >= 0 ? "pnl-positive" : "pnl-negative";
  }

  // Function to determine trading session based on UTC time
  function getTradingSession(timestamp) {
    if (!timestamp || timestamp === 0) return null;

    const date = new Date(timestamp * 1000);
    const utcHour = date.getUTCHours();

    // Trading session times in UTC:
    // Tokyo: 00:00 - 09:00 UTC (JST 09:00 - 18:00)
    // London: 08:00 - 17:00 UTC (GMT 08:00 - 17:00, or BST 09:00 - 18:00)
    // New York: 13:00 - 22:00 UTC (EST 08:00 - 17:00, or EDT 09:00 - 18:00)

    // Priority: London > New York > Tokyo (as requested)
    if (utcHour >= 8 && utcHour < 17) {
      return 'london'; // London session
    } else if (utcHour >= 13 && utcHour < 22) {
      return 'newyork'; // New York session (but London takes priority in overlap)
    } else if (utcHour >= 0 && utcHour < 9) {
      return 'tokyo'; // Tokyo session
    }

    return null; // No major trading session
  }

  function renderTable(rows) {
    clearTable();
    if (!rows || rows.length === 0) {
      emptyState.classList.remove("d-none");
      showMessage("");
      return;
    }

    showSuccess(`Found ${rows.length} trade${rows.length !== 1 ? "s" : ""}`);

    // Define the specific columns we want to display in order
    const displayColumns = [
      "coinName",
      "entryTime",
      "entryPrice",
      "positionSize",
      "exitTime",
      "exitPrice",
      "unrealized",
      "maxProfit",
      "maxProfitTime",
      "minProfit",
      "pnl"
    ];

    const tr = document.createElement("tr");

    displayColumns.forEach((c) => {
      const th = document.createElement("th");
      // Format column headers
      let headerText = c;
      if (c === "coinName") headerText = "Coin";
      else if (c === "entryPrice") headerText = "Entry Price";
      else if (c === "exitPrice") headerText = "Exit Price";
      else if (c === "unrealized") headerText = "Unrealized P&L";
      else if (c === "maxProfit") headerText = "Max Profit";
      else if (c === "maxProfitTime") headerText = "Max Profit Time";
      else if (c === "minProfit") headerText = "Min Profit";
      else if (c === "entryTime") headerText = "Entry Time";
      else if (c === "exitTime") headerText = "Exit Time";
      else if (c === "pnl") headerText = "Realized P&L";

      th.textContent = headerText;
      tr.appendChild(th);
    });

    const thAction = document.createElement("th");
    thAction.textContent = "Actions";
    tr.appendChild(thAction);
    tableHead.appendChild(tr);

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      displayColumns.forEach((c) => {
        const td = document.createElement("td");
        let v = r[c];
        if (v === null || typeof v === "undefined") v = "";

        // Special formatting for different columns
        if (c === "coinName") {
          // Combine coin name with position side as a tag
          const positionSide = r.positionSide || "";
          const sideTag = positionSide ? getPositionSideBadge(positionSide) : "";
          td.innerHTML = `<strong>${v}</strong> ${sideTag}`;
        } else if (
          (c === "unrealized" || c === "maxProfit" || c === "minProfit" || c === "pnl") &&
          typeof v === "number"
        ) {
          td.innerHTML = `<span class="${getPnLClass(v)}">${formatCurrency(
            v
          )}</span>`;
        } else if ((c === "unrealized" || c === "pnl") && (v === "" || v === null || v === undefined)) {
          // Show dash for empty unrealized P&L or realized P&L
          td.innerHTML = '<span class="text-muted">-</span>';
        } else if (
          (c === "entryPrice" || c === "exitPrice") &&
          typeof v === "number"
        ) {
          td.textContent = formatCurrency(v);
        } else if ((c === "entryTime" || c === "exitTime" || c === "maxProfitTime") && v) {
          if (v === 0) {
            td.innerHTML = '<span class="text-muted">-</span>';
          } else {
            td.textContent = new Date(v * 1000).toLocaleString();

            // Add trading session background color
            const session = getTradingSession(v);
            if (session) {
              td.classList.add(`session-${session}`);
            }
          }
        } else if (c === "maxProfitTime" && (v === "" || v === null || v === undefined)) {
          // Show dash for empty max profit time
          td.innerHTML = '<span class="text-muted">-</span>';
        } else {
          td.textContent = v;
        }
        tr.appendChild(td);
      });

      // Actions cell
      const tdAction = document.createElement("td");
      const actionContainer = document.createElement("div");
      actionContainer.className = "d-flex gap-1";

      if (r.status && r.status.toLowerCase() === "open") {
        // Close button for open positions
        const closeBtn = document.createElement("button");
        closeBtn.className = "btn btn-sm btn-outline-danger";
        closeBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i>Close';
        closeBtn.addEventListener("click", () => closePositionById(r));
        actionContainer.appendChild(closeBtn);
      }

      // Delete button for all positions
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-outline-dark";
      deleteBtn.innerHTML = '<i class="bi bi-trash me-1"></i>Delete';
      deleteBtn.title = "Delete this position permanently";
      deleteBtn.addEventListener("click", () => deletePositionById(r));
      actionContainer.appendChild(deleteBtn);

      if (actionContainer.children.length > 0) {
        tdAction.appendChild(actionContainer);
      } else {
        tdAction.innerHTML = '<span class="text-muted">-</span>';
      }

      tr.appendChild(tdAction);

      tableBody.appendChild(tr);
    });
  }

  // compute unrealized and realized PnL, and append unrealized property to rows
  async function enrichWithPnl(rows) {
    const FEE_RATE = 0.0002; // match server
    let realized = 0;
    let unrealized = 0;

    // sum realized from closed rows
    rows.forEach((r) => {
      if (
        r.status &&
        r.status.toLowerCase() === "close" &&
        typeof r.pnl === "number"
      ) {
        r.pnl = Number(r.pnl.toFixed(2));
        realized += r.pnl;
      }
    });

    // find unique coins for open positions
    const openRows = rows.filter(
      (r) => r.status && r.status.toLowerCase() === "open"
    );
    const coins = [...new Set(openRows.map((r) => r.coinName).filter(Boolean))];

    // fetch prices for each coin
    const priceMap = {};
    await Promise.all(
      coins.map(async (coin) => {
        try {
          const resp = await axios.get("/getprice-binance", {
            params: { coinname: coin },
            timeout: 8000,
          });
          if (resp && resp.data && typeof resp.data.price === "number") {
            priceMap[coin] = resp.data.price;
          }
        } catch (e) {
          console.warn("Binance price fetch failed for", coin, e && e.message);
          // Fallback to OKX endpoint
          try {
            const fallbackResp = await axios.get("/getprice", {
              params: { coinname: coin },
              timeout: 8000,
            });
            if (fallbackResp && fallbackResp.data && typeof fallbackResp.data.price === "number") {
              priceMap[coin] = fallbackResp.data.price;
            }
          } catch (fallbackErr) {
            console.warn("Fallback price fetch also failed for", coin, fallbackErr.message);
          }
        }
      })
    );

    // compute per-row unrealized and total
    rows.forEach((r) => {
      r.unrealized = "";
      if (r.status && r.status.toLowerCase() === "open") {
        const price = priceMap[r.coinName];

        if (typeof price === "number" && r.entryPrice && r.positionSize) {
          const quantity = r.positionSize / r.entryPrice;
          let gross = 0;
          if ((r.positionSide || "").toLowerCase() === "long")
            gross = (price - r.entryPrice) * quantity;
          else gross = (r.entryPrice - price) * quantity;
          const feeEntry = r.positionSize * FEE_RATE; // approximate entry fee
          const net = gross - feeEntry;
          r.unrealized = Number(net.toFixed(2));
          unrealized += net;
        }
      }
    });

    // update totals in DOM with proper formatting and colors
    const totalUnrealizedEl = document.getElementById("totalUnrealized");
    const totalRealizedEl = document.getElementById("totalRealized");

    if (totalUnrealizedEl) {
      totalUnrealizedEl.textContent = formatCurrency(unrealized);
      totalUnrealizedEl.className = getPnLClass(unrealized);
    }
    if (totalRealizedEl) {
      totalRealizedEl.textContent = formatCurrency(realized);
      totalRealizedEl.className = getPnLClass(realized);
    }

    return rows;
  }

  async function closePositionById(row) {
    if (!row || !row._id) return showError("Invalid position ID");

    const tableName = tableSelect.value;
    const coinName = row.coinName;
    const url = `/manage/${encodeURIComponent(coinName)}${tableName ? "?tableName=" + encodeURIComponent(tableName) : ""
      }`;
    const payload = { Action: "CloseById", id: row._id };

    showMessage("Closing position...", true);

    try {
      const resp = await axios.post(url, payload, { timeout: 10000 });
      showSuccess("Position closed successfully");
      // refresh table after a short delay
      setTimeout(() => fetchTrades(), 1000);
    } catch (err) {
      console.error(err);
      showError(
        "Error closing position: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    }
  }

  async function deletePositionById(row) {
    if (!row || !row._id) return showError("Invalid position ID");

    const tableName = tableSelect.value;
    const coinName = row.coinName;
    const url = `/manage/${encodeURIComponent(coinName)}${tableName ? "?tableName=" + encodeURIComponent(tableName) : ""
      }`;
    const payload = { Action: "DeleteById", id: row._id };

    showMessage("Deleting position...", true);

    try {
      const resp = await axios.post(url, payload, { timeout: 10000 });
      if (resp && resp.data) {
        showSuccess(`Position deleted successfully: ${resp.data.deletedPosition.coinName} ${resp.data.deletedPosition.positionSide}`);
        // refresh table after a short delay
        setTimeout(() => fetchTrades(), 1000);
      }
    } catch (err) {
      console.error(err);
      showError(
        "Error deleting position: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    }
  }

  async function recalculateHistoricalProfits() {
    const tableName = tableSelect.value;
    const url = `/manage/dummy${tableName ? "?tableName=" + encodeURIComponent(tableName) : ""}`;
    const payload = { Action: "RecalculateHistoricalProfits" };

    showMessage("Recalculating historical profits from 15m candles...", true);

    try {
      const resp = await axios.post(url, payload, { timeout: 60000 }); // Longer timeout for historical data
      if (resp && resp.data) {
        showSuccess(`Historical recalculation completed: ${resp.data.updatedPositions}/${resp.data.totalPositions} positions updated${resp.data.errorCount > 0 ? `, ${resp.data.errorCount} errors` : ''}`);
        // Refresh the table to show updated values
        setTimeout(() => fetchTrades(), 1000);
      }
    } catch (err) {
      console.error(err);
      showError(
        "Error recalculating historical profits: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    }
  }

  async function updateProfitTracking() {
    const tableName = tableSelect.value;
    const url = `/manage/dummy${tableName ? "?tableName=" + encodeURIComponent(tableName) : ""}`;
    const payload = { Action: "UpdateProfits" };

    showMessage("Updating profit tracking...", true);

    try {
      const resp = await axios.post(url, payload, { timeout: 15000 });
      if (resp && resp.data) {
        showSuccess(`Profit tracking updated: ${resp.data.updatedPositions}/${resp.data.totalPositions} positions updated`);
        // Refresh the table to show updated values
        setTimeout(() => fetchTrades(), 1000);
      }
    } catch (err) {
      console.error(err);
      showError(
        "Error updating profit tracking: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    }
  }

  async function bulkDeletePositions() {
    const tableName = tableSelect.value;
    const coinName = coinInput.value.trim();
    const status = statusSelect.value;

    // Build filter based on current search criteria
    const filter = {};
    if (coinName) {
      filter.coinName = { $regex: `^${coinName}`, $options: 'i' };
    }
    if (status && status !== 'all') {
      filter.status = status;
    }

    const url = `/manage/dummy${tableName ? "?tableName=" + encodeURIComponent(tableName) : ""}`;
    const payload = { Action: "BulkDelete", filter };

    showMessage("Performing bulk delete...", true);

    try {
      const resp = await axios.post(url, payload, { timeout: 15000 });
      if (resp && resp.data) {
        showSuccess(`Bulk delete completed: ${resp.data.deletedCount} positions deleted`);
        // refresh table after a short delay
        setTimeout(() => fetchTrades(), 1000);
      }
    } catch (err) {
      console.error(err);
      showError(
        "Error performing bulk delete: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    }
  }

  async function showBestCoins() {
    const tableName = tableSelect.value;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('bestCoinsModal'));
    modal.show();

    // Reset content to loading state
    const contentDiv = document.getElementById('bestCoinsContent');
    contentDiv.innerHTML = `
      <div class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading best performing coins...</p>
      </div>
    `;

    try {
      const resp = await axios.get('/getbest', {
        params: { table: tableName },
        timeout: 10000
      });

      if (resp && resp.data && Array.isArray(resp.data.coins)) {
        const coins = resp.data.coins;

        if (coins.length === 0) {
          contentDiv.innerHTML = `
            <div class="text-center text-muted">
              <i class="bi bi-inbox display-4"></i>
              <h5 class="mt-3">No closed trades found</h5>
              <p>Complete some trades to see performance analysis.</p>
            </div>
          `;
          return;
        }

        // Create performance table
        let tableHTML = `
          <div class="mb-3">
            <strong>Table:</strong> ${resp.data.tableName} 
            <span class="badge bg-primary ms-2">${resp.data.totalCoins} coins analyzed</span>
          </div>
          <div class="table-responsive">
            <table class="table table-hover">
              <thead class="table-dark">
                <tr>
                  <th>Rank</th>
                  <th>Coin</th>
                  <th>Total P&L</th>
                  <th>Trades</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
        `;

        coins.forEach((coin, index) => {
          const pnlClass = coin.totalPnl >= 0 ? 'text-success' : 'text-danger';
          const rankBadge = index < 3 ? `<span class="badge bg-warning text-dark">#${index + 1}</span>` : `#${index + 1}`;

          tableHTML += `
            <tr>
              <td>${rankBadge}</td>
              <td><strong>${coin.coinName}</strong></td>
              <td class="${pnlClass}"><strong>${formatCurrency(coin.totalPnl)}</strong></td>
              <td>${coin.tradeCount}</td>
              <td class="text-success">${coin.winCount}</td>
              <td class="text-danger">${coin.lossCount}</td>
              <td>
                <span class="badge ${coin.winRate >= 50 ? 'bg-success' : 'bg-secondary'}">
                  ${coin.winRate}%
                </span>
              </td>
            </tr>
          `;
        });

        tableHTML += `
              </tbody>
            </table>
          </div>
        `;

        contentDiv.innerHTML = tableHTML;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error(err);
      contentDiv.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          <strong>Error loading best coins:</strong> ${err.message}
        </div>
      `;
    }
  }

  async function fetchTrades() {
    const tableName = tableSelect.value;
    const coinName = coinInput.value.trim();
    const status = statusSelect.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    const params = {};
    if (tableName) params.tableName = tableName;
    if (coinName) params.coinName = coinName;
    if (status) params.status = status;

    showMessage("Loading trades...", true);

    try {
      const resp = await axios.get(baseURL + "/gettrades", {
        params,
        timeout: 10000,
      });
      if (resp && resp.data && Array.isArray(resp.data.trades)) {
        let trades = resp.data.trades;

        // Filter trades by entryTime date ignoring time part
        if (startDate) {
          const start = new Date(startDate);
          trades = trades.filter((t) => {
            if (!t.entryTime) return false;
            const entryDate = new Date(t.entryTime * 1000);
            // Zero out time part for comparison
            entryDate.setHours(0, 0, 0, 0);
            return entryDate >= start;
          });
        }

        if (endDate) {
          const end = new Date(endDate);
          // Zero out time and set to end of day
          end.setHours(0, 0, 0, 0);
          trades = trades.filter((t) => {
            if (!t.entryTime) return false;
            const entryDate = new Date(t.entryTime * 1000);
            entryDate.setHours(0, 0, 0, 0);
            return entryDate <= end;
          });
        }

        // Update totals
        if (typeof totalUnrealized !== 'undefined') {
          // This might be calculated inside enrichWithPnl, or we can do it here if needed
          // refapp.js does it inside enrichWithPnl
        }

        const enriched = await enrichWithPnl(trades);
        renderTable(enriched);

      } else {
        showError("Unexpected response format");
      }
    } catch (err) {
      console.error(err);
      showError(
        "Error fetching trades: " +
        (err.response && err.response.data
          ? JSON.stringify(err.response.data)
          : err.message)
      );
    } finally {
      if (loadingSpinner.style.display !== "none" && message.classList.contains("alert-info")) {
        loadingSpinner.style.display = "none";
        if (tableBody.children.length > 0) message.classList.add('d-none');
      }
    }
  }



  function clearFilters() {
    coinInput.value = "";
    statusSelect.value = "all";
    startDateInput.value = "";
    endDateInput.value = "";
    clearTable();
    showMessage("");
    // Reset P&L totals
    document.getElementById("totalUnrealized").textContent = "$0.00";
    document.getElementById("totalRealized").textContent = "$0.00";
    document.getElementById("totalUnrealized").className = "";
    document.getElementById("totalRealized").className = "";
  }


  // Event listeners
  fetchBtn.addEventListener("click", fetchTrades);
  clearBtn.addEventListener("click", clearFilters);
  updateProfitsBtn.addEventListener("click", updateProfitTracking);
  recalculateHistoricalBtn.addEventListener("click", recalculateHistoricalProfits);
  bulkDeleteBtn.addEventListener("click", bulkDeletePositions);
  bestCoinsBtn.addEventListener("click", showBestCoins);

  // Allow Enter key to trigger search
  coinInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") fetchTrades();
  });

  // Auto-refresh every 30 seconds for open positions
  setInterval(() => {
    if (statusSelect.value === "open" || statusSelect.value === "all") {
      fetchTrades();
    }
  }, 30000);

  // Initial load
  loadTables().then(() => fetchTrades());
})();
