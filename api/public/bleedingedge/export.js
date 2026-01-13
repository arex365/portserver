function exportTableToCSV(filename = "trades.csv") {
  const table = document.getElementById("tradesTable"); // change to your table ID if different
  if (!table) {
    alert("Table not found!");
    return;
  }

  let csv = [];
  const rows = table.querySelectorAll("thead tr, tbody tr");

  rows.forEach(row => {
    let rowData = [];
    // Get all visible cells (th or td)
    const cells = row.querySelectorAll("th, td");
    cells.forEach(cell => {
      // Get text content and escape quotes
      let text = cell.textContent.trim().replace(/"/g, '""');
      // Wrap with quotes in case of commas/newlines
      rowData.push(`"${text}"`);
    });
    csv.push(rowData.join(","));
  });

  // Create a Blob with CSV data
  const csvBlob = new Blob([csv.join("\n")], { type: "text/csv" });

  // Create a temporary link to trigger download
  const url = URL.createObjectURL(csvBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-csv");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportTableToCSV("trades.csv"); // optional: you can change filename
    });
  }
});