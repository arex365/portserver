(function () {
  const tableSelect = document.getElementById("tableSelect");
  const coinInput = document.getElementById("coinInput");
  const statusSelect = document.getElementById("statusSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const loadChartBtn = document.getElementById("loadChartBtn");
  const clearBtn = document.getElementById("clearBtn");

  const ctx = document.getElementById("pnlChart").getContext("2d");
  let pnlChart = null;

  // Load table names
  async function loadTables() {
    try {
      const resp = await axios.get("/tables");
      tableSelect.innerHTML = "";
      resp.data.tables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        tableSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Failed to load tables", err);
    }
  }

  async function loadChart() {
    const params = {};
    if (tableSelect.value) params.tableName = tableSelect.value;
    if (coinInput.value.trim()) params.coinName = coinInput.value.trim();
    if (statusSelect.value) params.status = statusSelect.value;

    try {
      const resp = await axios.get("/gettrades", { params });
      let trades = resp.data.trades || [];

      // Date filtering (by entryTime)
      if (startDateInput.value) {
        const start = new Date(startDateInput.value);
        trades = trades.filter(t => new Date(t.entryTime * 1000) >= start);
      }

      if (endDateInput.value) {
        const end = new Date(endDateInput.value);
        end.setHours(23, 59, 59, 999);
        trades = trades.filter(t => new Date(t.entryTime * 1000) <= end);
      }

      renderPnlChart(trades);
    } catch (err) {
      console.error("Failed to load trades", err);
    }
  }

  function renderPnlChart(trades) {
    if (pnlChart) pnlChart.destroy();

    // Sort by time
    trades.sort((a, b) => a.entryTime - b.entryTime);

    const labels = [];
    const pnlData = [];
    let cumulative = 0;

    trades.forEach(t => {
      if (typeof t.pnl === "number") {
        cumulative += t.pnl;
        labels.push(new Date(t.entryTime * 1000).toLocaleDateString());
        pnlData.push(cumulative.toFixed(2));
      }
    });

    pnlChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Cumulative Realized P&L",
          data: pnlData,
          borderColor: "#198754",
          backgroundColor: "rgba(25, 135, 84, 0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: ctx => `$${ctx.raw}`
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: value => `$${value}`
            }
          }
        }
      }
    });
  }

  function clearFilters() {
    coinInput.value = "";
    statusSelect.value = "all";
    startDateInput.value = "";
    endDateInput.value = "";
    if (pnlChart) pnlChart.destroy();
  }

  loadChartBtn.addEventListener("click", loadChart);
  clearBtn.addEventListener("click", clearFilters);

  loadTables();
})();
