(function () {
  const tableSelect = document.getElementById("tableSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const loadBtn = document.getElementById("loadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusMsg = document.getElementById("statusMsg");
  const chartsGrid = document.getElementById("chartsGrid");

  // Subscription elements
  const subscribeModalEl = document.getElementById("subscribeModal");
  let subscribeModal = null; // init later
  const sStrategy = document.getElementById('sStrategy');
  const sId = document.getElementById('sId');
  const sCoin = document.getElementById('sCoin');
  const sAmount = document.getElementById('sAmount');
  const confirmSubBtn = document.getElementById('confirmSubBtn');
  const subMsg = document.getElementById('subMsg');

  const chartRefs = {}; // Store chart instances by coin name
  const API_URL = ""; // Relative path

  function showMessage(text, type = "info") {
    if (!text) {
      statusMsg.classList.add("d-none");
      statusMsg.textContent = "";
      return;
    }
    statusMsg.className = `alert alert-${type}`;
    statusMsg.textContent = text;
  }

  // State
  let userSubscriptions = [];

  async function fetchUserSubscriptions() {
    const userId = Settings.getUserId();
    if (!userId) {
      userSubscriptions = [];
      return;
    }
    try {
      const resp = await axios.get(`/subscriptions?id=${userId}`);
      userSubscriptions = resp.data || [];
      console.log("Loaded subscriptions:", userSubscriptions);
    } catch (e) {
      console.error("Failed to load subs", e);
      userSubscriptions = [];
    }
  }

  function isSubscribed(coinName) {
    if (!userSubscriptions.length) return false;

    const currentStrategy = tableSelect.value; // active table name matches strategy name

    for (const strat of userSubscriptions) {
      // Strict check: strategy name must match selected table
      if (strat.strategy === currentStrategy && strat.entries) {
        for (const entry of strat.entries) {
          if (entry.whitelist && (entry.whitelist.includes(coinName) || entry.whitelist.includes("ALL"))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  async function loadTables() {
    try {
      await fetchUserSubscriptions(); // Load subs first
      const resp = await axios.get("/tables", { timeout: 5000 });
      const tables = (resp && resp.data && Array.isArray(resp.data.tables)) ? resp.data.tables : [];
      tableSelect.innerHTML = "";
      tables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        tableSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn("Could not load tables:", err.message || err);
    }
  }

  function applyDateFilter(trades) {
    let filtered = trades.slice();
    if (startDateInput.value) {
      const start = new Date(startDateInput.value);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate >= start;
      });
    }
    if (endDateInput.value) {
      const end = new Date(endDateInput.value);
      end.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate <= end;
      });
    }
    return filtered;
  }

  function groupTradesByCoin(trades) {
    const grouped = {};
    trades.forEach(t => {
      if (!t || (t.status && t.status.toLowerCase() !== "close")) return;
      if (typeof t.pnl !== "number") return;
      const coin = t.coinName || "UNKNOWN";
      if (!grouped[coin]) grouped[coin] = [];
      grouped[coin].push(t);
    });

    // Sort coins by total net P&L descending
    const entries = Object.entries(grouped).map(([coin, trades]) => {
      const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
      return { coin, trades, netPnl };
    }).sort((a, b) => b.netPnl - a.netPnl);

    return entries;
  }

  function destroyAllCharts() {
    Object.values(chartRefs).forEach(chart => {
      if (chart) chart.destroy();
    });
    Object.keys(chartRefs).forEach(key => delete chartRefs[key]);
  }

  function openSubscribeModal(coinName) {
    if (!subscribeModal) {
      subscribeModal = new bootstrap.Modal(subscribeModalEl);
    }
    sCoin.value = coinName;
    subMsg.textContent = '';
    subMsg.className = '';
    // Auto-fill ID if available
    sId.value = Settings.getUserId();
    // Auto-fill Strategy with current table
    sStrategy.value = tableSelect.value;
    subscribeModal.show();
  }

  async function performSubscription() {
    const body = {
      strategy: sStrategy.value,
      id: Number(sId.value),
      coin: sCoin.value,
      amount: Number(sAmount.value)
    };

    confirmSubBtn.disabled = true;
    confirmSubBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Subscribing...';

    try {
      const res = await axios.post('/subscribe', body);
      if (res.status === 200) {
        subMsg.textContent = "Subscribed Successfully ✔";
        subMsg.className = "mt-2 text-center small fw-bold text-success";
        // Refresh subscriptions to update UI
        await fetchUserSubscriptions();
        loadCharts(); // Re-render to update icons
        setTimeout(() => {
          subscribeModal.hide();
          subMsg.textContent = '';
        }, 1500);
      } else {
        throw new Error("Failed");
      }
    } catch (err) {
      console.error(err);
      subMsg.textContent = "Subscription Failed ❌";
      subMsg.className = "mt-2 text-center small fw-bold text-danger";
    } finally {
      confirmSubBtn.disabled = false;
      confirmSubBtn.textContent = 'Subscribe';
    }
  }

  function renderCharts(coinEntries) {
    destroyAllCharts();
    chartsGrid.innerHTML = '';

    if (!coinEntries.length) {
      chartsGrid.innerHTML = '<div class="no-data">No closed trades found for the selected filters.</div>';
      return;
    }

    coinEntries.forEach(entry => {
      const { coin, trades, netPnl } = entry;

      trades.sort((a, b) => a.entryTime - b.entryTime);

      const labels = [];
      const pnlData = [];
      let cumulative = 0;

      trades.forEach(t => {
        if (typeof t.pnl === "number") {
          cumulative += t.pnl;
          labels.push(new Date(t.entryTime * 1000).toLocaleDateString());
          pnlData.push(parseFloat(cumulative.toFixed(2)));
        }
      });

      const card = document.createElement("div");
      card.className = "chart-card";

      // Check subscription status
      const subscribed = isSubscribed(coin);
      const bellClass = subscribed ? "bi-bell-fill text-warning" : "bi-bell";
      const btnTitle = subscribed ? "Subscribed (Click to manage)" : "Subscribe";

      // Header with Subscribe Button
      const header = document.createElement("h5");
      header.className = "d-flex justify-content-between align-items-center mb-3";

      const titleDiv = document.createElement("div");
      const pnlClass = netPnl >= 0 ? "positive" : "negative";
      titleDiv.innerHTML = `
        <span class="fw-bold me-2">${coin}</span>
        <span class="coin-pnl ${pnlClass}">$${netPnl.toFixed(2)}</span>
      `;

      const subBtn = document.createElement("button");
      subBtn.className = "btn btn-sm btn-outline-secondary border-0"; // cleaner look
      subBtn.innerHTML = `<i class="bi ${bellClass}" style="font-size: 1.2rem;"></i>`;
      subBtn.title = btnTitle;
      subBtn.onclick = () => openSubscribeModal(coin);

      header.appendChild(titleDiv);
      header.appendChild(subBtn);

      const statsDiv = document.createElement("div");
      statsDiv.style.fontSize = "0.85rem";
      statsDiv.style.color = "#6c757d";
      statsDiv.style.marginBottom = "10px";
      statsDiv.textContent = `${trades.length} trade${trades.length !== 1 ? 's' : ''}`;

      const canvasWrapper = document.createElement("div");
      canvasWrapper.style.position = "relative";
      canvasWrapper.style.height = "300px";

      const canvas = document.createElement("canvas");
      canvasWrapper.appendChild(canvas);

      card.appendChild(header);
      card.appendChild(statsDiv);
      card.appendChild(canvasWrapper);
      chartsGrid.appendChild(card);

      const lineColor = netPnl >= 0 ? "#198754" : "#dc3545";
      const bgColor = netPnl >= 0 ? "rgba(25, 135, 84, 0.1)" : "rgba(220, 53, 69, 0.1)";

      const ctx = canvas.getContext("2d");
      chartRefs[coin] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Cumulative P&L',
            data: pnlData,
            borderColor: lineColor,
            backgroundColor: bgColor,
            tension: 0.3,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: lineColor,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              ticks: { callback: v => `$${Number(v).toFixed(0)}` }
            }
          },
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: { label: ctx => `$${Number(ctx.raw).toFixed(2)}` }
            }
          }
        }
      });
    });
  }

  async function loadCharts() {
    showMessage('Loading trades...', 'info');
    await fetchUserSubscriptions(); // Refresh subs before rendering
    const params = {};
    if (tableSelect.value) params.tableName = tableSelect.value;
    params.status = 'close';
    try {
      const resp = await axios.get('/gettrades', { params, timeout: 10000 });
      const trades = Array.isArray(resp.data?.trades) ? resp.data.trades : [];
      const filtered = applyDateFilter(trades);
      const grouped = groupTradesByCoin(filtered);
      if (!grouped.length) {
        showMessage('No closed trades found for the selected filters.', 'warning');
        chartsGrid.innerHTML = '<div class="no-data">No data found.</div>';
        return;
      }
      renderCharts(grouped);
      showMessage(`Loaded ${grouped.length} coin${grouped.length > 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      console.error(err);
      showMessage('Error loading trades: ' + (err.message || err), 'danger');
    }
  }

  function clearFilters() {
    startDateInput.value = '';
    endDateInput.value = '';
    destroyAllCharts();
    chartsGrid.innerHTML = '<div class="no-data">No data loaded. Select filters and click "Load Charts"</div>';
    showMessage('', 'info');
  }

  loadBtn.addEventListener('click', loadCharts);
  clearBtn.addEventListener('click', clearFilters);
  confirmSubBtn.addEventListener('click', performSubscription);

  // init
  loadTables();
})();
