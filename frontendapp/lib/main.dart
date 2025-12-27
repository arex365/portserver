import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';
import 'api.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';

Process? rustServerProcess;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await _startRustServer();

  runApp(const MyApp());
}

Future<void> _startRustServer() async {
  try {
    rustServerProcess = await Process.start(
      'rustserver.exe',
      [],
      workingDirectory: Directory.current.path,
      runInShell: true,
    );

    debugPrint("Rust server started pid=${rustServerProcess?.pid}");

    rustServerProcess?.stdout
        .transform(SystemEncoding().decoder)
        .listen(debugPrint);

    rustServerProcess?.stderr
        .transform(SystemEncoding().decoder)
        .listen(debugPrint);
  } catch (e) {
    debugPrint("Failed to start rustserver.exe: $e");
  }

  ProcessSignal.sigint.watch().listen((_) => _shutdownRustServer());
  ProcessSignal.sigterm.watch().listen((_) => _shutdownRustServer());
}

Future<void> _shutdownRustServer() async {
  debugPrint("Shutting down Rust server...");
  rustServerProcess?.kill(ProcessSignal.sigterm);
}


class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trading Dashboard',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.light().copyWith(
        scaffoldBackgroundColor: const Color(0xFFF3F4F6),
        primaryColor: const Color(0xFF1E3A8A),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF1E3A8A),
          secondary: Color(0xFF16A34A),
        ),
        textTheme: GoogleFonts.poppinsTextTheme(
          ThemeData.light().textTheme,
        ).apply(bodyColor: Colors.black87),
        cardColor: Colors.white,
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1E3A8A),
            foregroundColor: Colors.white,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none,
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFE6EEF8),
          elevation: 1,
          iconTheme: IconThemeData(color: Colors.black87),
          titleTextStyle:
              TextStyle(color: Colors.black87, fontSize: 20),
        ),
      ),
      home: const RustServerGate(),
    );
  }
}
class RustServerGate extends StatefulWidget {
  const RustServerGate({super.key});

  @override
  State<RustServerGate> createState() => _RustServerGateState();
}

class _RustServerGateState extends State<RustServerGate> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _waitForServerReady();
  }

  Future<void> _waitForServerReady() async {
    const uri = 'http://localhost:5007';
    const retryDelay = Duration(seconds: 1);

    while (mounted && !_ready) {
      try {
        final client = HttpClient();
        final req = await client.getUrl(Uri.parse(uri));
        final res = await req.close();

        if (res.statusCode == 200) {
          setState(() => _ready = true);
        }

        client.close();
      } catch (_) {
        debugPrint("Waiting for Rust server...");
      }

      if (!_ready) {
        await Future.delayed(retryDelay);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const LoadingScreen();
    return const DashboardPage();
  }
}

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFFF3F4F6),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(
              strokeWidth: 4,
            ),
            SizedBox(height: 16),
            Text(
              "Setting up server...",
              style: TextStyle(
                color: Colors.black87,
                fontSize: 18,
              ),
            )
          ],
        ),
      ),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final NumberFormat currency = NumberFormat.simpleCurrency();
  List<String> tables = ['positions'];
  String selectedTable = 'positions';
  String coinFilter = '';
  String statusFilter = 'all';
  List<dynamic> trades = [];
  double totalUnrealized = 0.0;
  double totalRealized = 0.0;
  Timer? refreshTimer;
  bool loading = false;
  String? lastError;

  @override
  void initState() {
    super.initState();
    loadTablesAndTrades();
    refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (statusFilter == 'open' || statusFilter == 'all') loadTrades();
    });
  }

  @override
  void dispose() {
    refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> loadTablesAndTrades() async {
    try {
      final t = await Api.fetchTables();
      setState(() {
        tables = t.isNotEmpty ? t : ['positions'];
        selectedTable = tables.first;
        lastError = null;
      });
    } catch (e) {
      setState(() {
        lastError = 'Failed to load tables: $e';
      });
    }
    await loadTrades();
  }

  Future<void> loadTrades() async {
    setState(() => loading = true);
    try {
      final t = await Api.fetchTrades(tableName: selectedTable, coinName: coinFilter.isEmpty ? null : coinFilter, status: statusFilter);
      await enrichWithPnl(t);
      // sort latest trades on top (by entryTime -> exitTime)
      t.sort((a, b) {
        final na = (a['entryTime'] ?? a['exitTime'] ?? 0) as num;
        final nb = (b['entryTime'] ?? b['exitTime'] ?? 0) as num;
        return nb.compareTo(na); // descending
      });
      setState(() {
        trades = t;
        lastError = null;
      });
    } catch (e) {
      debugPrint('loadTrades error: $e');
      setState(() {
        lastError = 'Failed to load trades: $e';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error loading trades: $e')));
    }
    setState(() => loading = false);
  }

  Future<void> enrichWithPnl(List<dynamic> rows) async {
    const FEE_RATE = 0.0002; // same as server
    double realized = 0;
    double unrealized = 0;

    for (var r in rows) {
      if (r['status'] != null && (r['status'] as String).toLowerCase() == 'close' && r['pnl'] is num) {
        r['pnl'] = (r['pnl'] as num).toDouble();
        realized += (r['pnl'] as num).toDouble();
      }
    }

    final openRows = rows.where((r) => r['status'] != null && (r['status'] as String).toLowerCase() == 'open').toList();
    final coins = openRows.map((r) => r['coinName']).whereType<String>().toSet().toList();

    final Map<String, double> priceMap = {};
    await Future.wait(coins.map((coin) async {
      try {
        final p = await Api.fetchPriceBinance(coin);
        priceMap[coin] = p;
      } catch (e) {
        debugPrint('Price fetch error for $coin: $e');
      }
    }));

    for (var r in rows) {
      r['unrealized'] = null;
      if (r['status'] != null && (r['status'] as String).toLowerCase() == 'open') {
        final price = priceMap[r['coinName']];
        if (price != null && r['entryPrice'] is num && r['positionSize'] is num) {
          final quantity = (r['positionSize'] as num).toDouble() / (r['entryPrice'] as num).toDouble();
          double gross = 0;
          if ((r['positionSide'] as String).toLowerCase() == 'long') {
            gross = (price - (r['entryPrice'] as num)).toDouble() * quantity;
          } else {
            gross = ((r['entryPrice'] as num) - price).toDouble() * quantity;
          }
          final feeEntry = (r['positionSize'] as num).toDouble() * FEE_RATE;
          final net = gross - feeEntry;
          r['unrealized'] = double.parse(net.toStringAsFixed(2));
          unrealized += net;
        }
      }
    }

    setState(() {
      totalUnrealized = unrealized;
      totalRealized = realized;
    });
  }

  String formatCurrency(dynamic v) {
    if (v == null) return '-';
    if (v is num) return currency.format(v.toDouble());
    return v.toString();
  }

  String formatTime(dynamic v) {
    if (v == null) return '-';
    try {
      final seconds = (v is num) ? v.toInt() : int.parse(v.toString());
      if (seconds == 0) return '-';
      final dt = DateTime.fromMillisecondsSinceEpoch(seconds * 1000).toLocal();
      return DateFormat.yMd().add_jm().format(dt);
    } catch (_) {
      return '-';
    }
  }

  String? tradingSession(dynamic v) {
    if (v == null) return null;
    try {
      final seconds = (v is num) ? v.toInt() : int.parse(v.toString());
      if (seconds == 0) return null;
      final dtUtc = DateTime.fromMillisecondsSinceEpoch(seconds * 1000).toUtc();
      final utcHour = dtUtc.hour;
      if (utcHour >= 8 && utcHour < 17) return 'london';
      if (utcHour >= 13 && utcHour < 22) return 'newyork';
      if (utcHour >= 0 && utcHour < 9) return 'tokyo';
      return null;
    } catch (_) {
      return null;
    }
  }

  Color sessionColor(String? s) {
    switch (s) {
      case 'london':
        return const Color(0xFFF6C84C).withOpacity(0.12);
      case 'newyork':
        return const Color(0xFF2BD98A).withOpacity(0.12);
      case 'tokyo':
        return const Color(0xFF4EA3FF).withOpacity(0.12);
      default:
        return Colors.transparent;
    }
  }

  Future<void> closePosition(Map<String, dynamic> row) async {
    if (row == null || row['_id'] == null) return;
    final coin = row['coinName'];
    try {
      await Api.postManage(coin, {'Action': 'CloseById', 'id': row['_id']}, tableName: selectedTable);
      await loadTrades();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Position closed')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> deletePosition(Map<String, dynamic> row) async {
    if (row == null || row['_id'] == null) return;
    final coin = row['coinName'];
    try {
      await Api.postManage(coin, {'Action': 'DeleteById', 'id': row['_id']}, tableName: selectedTable);
      await loadTrades();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Position deleted')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> showBestCoins() async {
    try {
      final resp = await Api.fetchBest(selectedTable);
      if (resp != null && resp['coins'] is List) {
        final coins = List.from(resp['coins']);
        showDialog(
            context: context,
            builder: (_) => AlertDialog(
                  title: const Text('Best Coins'),
                  content: SizedBox(
                    width: 600,
                    child: SingleChildScrollView(
                      child: Column(
                        children: coins.map((c) {
                          return ListTile(
                            title: Text(c['coinName'] ?? ''),
                            subtitle: Text('PnL: ${formatCurrency(c['totalPnl'] ?? 0)} - Trades: ${c['tradeCount'] ?? 0}'),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                  actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
                ));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      setState(() => lastError = 'getbest failed: $e');
    }
  }

  Widget buildControls() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          children: [
            if (lastError != null) Padding(
              padding: const EdgeInsets.only(bottom: 8.0),
              child: Row(
                children: [
                  Expanded(child: Text(lastError!, style: const TextStyle(color: Colors.red))),
                  TextButton(onPressed: () => setState(() => lastError = null), child: const Text('Dismiss'))
                ],
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: selectedTable,
                    decoration: const InputDecoration(labelText: 'Table'),
                    items: tables.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                    onChanged: (v) => setState(() => selectedTable = v ?? selectedTable),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Cryptocurrency'),
                    onChanged: (v) => coinFilter = v.trim(),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: statusFilter,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: const [
                      DropdownMenuItem(value: 'all', child: Text('All Positions')),
                      DropdownMenuItem(value: 'open', child: Text('Open Positions')),
                      DropdownMenuItem(value: 'close', child: Text('Closed Positions')),
                    ],
                    onChanged: (v) => setState(() => statusFilter = v ?? statusFilter),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton(onPressed: loadTrades, child: const Text('Fetch')),
                const SizedBox(width: 8),
                OutlinedButton(
                    onPressed: () {
                      setState(() {
                        coinFilter = '';
                        statusFilter = 'all';
                      });
                      loadTrades();
                    },
                    child: const Text('Clear'))
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                ElevatedButton(onPressed: () async {
                  try {
                    final resp = await Api.postManage('dummy', {'Action': 'UpdateProfits'}, tableName: selectedTable);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Updated: \\${resp['updatedPositions'] ?? 0}')));
                    loadTrades();
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                  }
                }, child: const Text('Update Profits')),
                const SizedBox(width: 8),
                ElevatedButton(onPressed: () async {
                  try {
                    final resp = await Api.postManage('dummy', {'Action': 'RecalculateHistoricalProfits'}, tableName: selectedTable);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Recalc done: \\${resp['updatedPositions'] ?? 0}/\\${resp['totalPositions'] ?? 0}')));
                    loadTrades();
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                  }
                }, child: const Text('Recalculate Historical')),
                const SizedBox(width: 8),
                ElevatedButton(onPressed: () async {
                  try {
                    final resp = await Api.postManage('dummy', {'Action': 'BulkDelete', 'filter': {}} , tableName: selectedTable);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Deleted: \\${resp['deletedCount'] ?? 0}')));
                    loadTrades();
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                  }
                }, child: const Text('Bulk Delete')),
                const SizedBox(width: 8),
                ElevatedButton(onPressed: showBestCoins, child: const Text('Best Coins'))
              ],
            )
          ],
        ),
      ),
    );
  }

  Widget buildTable() {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (trades.isEmpty) return const Center(child: Text('No positions'));

    // Use ListView for vertical scrolling and a horizontal SingleChildScrollView for table scroll
    return ListView(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            columnSpacing: 20,
            headingRowHeight: 48,
            dataRowHeight: 56,
            columns: [
              DataColumn(label: Text('Coin')),
              DataColumn(label: Text('Entry Time')),
              DataColumn(label: Text('Entry Price')),
              DataColumn(label: Text('Exit Time')),
              DataColumn(label: Text('Exit Price')),
              DataColumn(label: Text('Unrealized')),
              DataColumn(label: Text('MaxProfit')),
              DataColumn(label: Text('MinProfit')),
              DataColumn(label: Text('PnL')),
              DataColumn(label: Text('Actions')),
            ],
            rows: trades.map((r) {
              final status = (r['status'] ?? '').toString().toLowerCase();
              final entryTime = r['entryTime'] ?? 0;
              final exitTime = r['exitTime'] ?? 0;
              final entrySession = tradingSession(entryTime);
              final exitSession = tradingSession(exitTime);

              final pnl = (r['pnl'] is num) ? (r['pnl'] as num).toDouble() : null;
              final unrealized = (r['unrealized'] is num) ? (r['unrealized'] as num).toDouble() : null;

              return DataRow(cells: [
                DataCell(Row(children: [
                  Text(r['coinName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black87)),
                  const SizedBox(width: 8),
                  Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: (r['positionSide'] ?? '').toString().toLowerCase() == 'long' ? Colors.green[700] : Colors.red[700], borderRadius: BorderRadius.circular(8)), child: Text((r['positionSide'] ?? '').toString(), style: const TextStyle(color: Colors.white, fontSize: 12)))
                ])),
                DataCell(Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:6), decoration: BoxDecoration(color: sessionColor(entrySession), borderRadius: BorderRadius.circular(8)), child: Text(formatTime(entryTime), style: const TextStyle()))),
                DataCell(Text(r['entryPrice'] != null ? formatCurrency(r['entryPrice']) : '-', style: const TextStyle(color: Colors.black87))),
                DataCell(Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:6), decoration: BoxDecoration(color: sessionColor(exitSession), borderRadius: BorderRadius.circular(8)), child: Text(formatTime(exitTime), style: const TextStyle()))),
                DataCell(Text(r['exitPrice'] != null ? formatCurrency(r['exitPrice']) : '-', style: const TextStyle(color: Colors.black87))),
                DataCell(Text(unrealized != null ? formatCurrency(unrealized) : '-', style: TextStyle(color: unrealized != null && unrealized >=0 ? Colors.green[700] : Colors.red[700]))),
                DataCell(Text(r['maxProfit'] != null ? formatCurrency(r['maxProfit']) : '-', style: const TextStyle(color: Colors.black87))),
                DataCell(Text(r['minProfit'] != null ? formatCurrency(r['minProfit']) : '-', style: const TextStyle(color: Colors.black87))),
                DataCell(Text(pnl != null ? formatCurrency(pnl) : '-', style: TextStyle(color: pnl != null && pnl >=0 ? Colors.green[700] : Colors.red[700]))),
                DataCell(
                  SizedBox(
                    width: 220,
                    child: Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (status == 'open') SizedBox(width: 100, height: 36, child: ElevatedButton(onPressed: () => closePosition(r), style: ElevatedButton.styleFrom(textStyle: const TextStyle(fontSize: 14)), child: const Text('Close'))),
                        SizedBox(width: 100, height: 36, child: OutlinedButton(onPressed: () => deletePosition(r), style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 14)), child: const Text('Delete'))),
                      ],
                    ),
                  ),
                ),
              ]);
            }).toList(),
          ),
        ),
      ],
    );
  }

  Future<void> testBackend() async {
    try {
      final price = await Api.fetchPriceBinance('BTC');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Backend OK — BTC price: ${formatCurrency(price)}')));
      setState(() => lastError = null);
    } catch (e) {
      final msg = 'Backend test failed: $e';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      setState(() => lastError = msg);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Trading Dashboard'), actions: [IconButton(onPressed: testBackend, icon: const Icon(Icons.cloud))]),
      body: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Card(
                    color: Theme.of(context).cardColor,
                    elevation: 6,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Unrealized P&L', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Colors.black54)),
                          const SizedBox(height: 8),
                          Text(formatCurrency(totalUnrealized), style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: totalUnrealized >= 0 ? Colors.green[700] : Colors.red[700], fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Card(
                    color: Theme.of(context).cardColor,
                    elevation: 6,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Realized P&L', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Colors.white70)),
                          const SizedBox(height: 8),
                          Text(formatCurrency(totalRealized), style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: totalRealized >= 0 ? Colors.green[700] : Colors.red[700], fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            buildControls(),
            const SizedBox(height: 12),
            Expanded(child: buildTable())
          ],
        ),
      ),
    );
  }
}

// TradeCard widget (top-level)
class _TradeCard extends StatefulWidget {
  final Map<String, dynamic> trade;
  final VoidCallback onClose;
  final VoidCallback onDelete;
  final String Function(dynamic) formatCurrencyFn;
  final String Function(dynamic) formatTimeFn;
  final String? Function(dynamic) tradingSessionFn;
  final Color Function(String?) sessionColorFn;

  const _TradeCard({required this.trade, required this.onClose, required this.onDelete, required this.formatCurrencyFn, required this.formatTimeFn, required this.tradingSessionFn, required this.sessionColorFn, Key? key}) : super(key: key);

  @override
  State<_TradeCard> createState() => _TradeCardState();
}

class _TradeCardState extends State<_TradeCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.trade;
    final status = (r['status'] ?? '').toString().toLowerCase();
    final pnl = (r['pnl'] is num) ? (r['pnl'] as num).toDouble() : null;
    final unrealized = (r['unrealized'] is num) ? (r['unrealized'] as num).toDouble() : null;
    final entrySession = widget.tradingSessionFn(r['entryTime']);
    final exitSession = widget.tradingSessionFn(r['exitTime']);

    return MouseRegion(
      onEnter: (_) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _hover = true);
        });
      },
      onExit: (_) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _hover = false);
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.symmetric(horizontal: 0, vertical: 6),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(10),
          boxShadow: _hover ? [BoxShadow(color: Colors.black12, blurRadius: 8, offset: const Offset(0,4))] : [],
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal:16, vertical:12),
          title: Row(
            children: [
              Text(r['coinName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: (r['positionSide'] ?? '').toString().toLowerCase() == 'long' ? Colors.green[700] : Colors.red[700], borderRadius: BorderRadius.circular(8)), child: Text((r['positionSide'] ?? '').toString(), style: const TextStyle(color: Colors.white, fontSize: 12)))
            ],
          ),
          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height:6),
            Wrap(spacing: 8, runSpacing: 6, children: [
              Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:6), decoration: BoxDecoration(color: widget.sessionColorFn(entrySession), borderRadius: BorderRadius.circular(8)), child: Text(widget.formatTimeFn(r['entryTime']), style: const TextStyle())),
              Container(padding: const EdgeInsets.symmetric(horizontal:4), child: Flexible(child: Text('Entry: ${r['entryPrice'] != null ? widget.formatCurrencyFn(r['entryPrice']) : '-'}', overflow: TextOverflow.ellipsis, maxLines: 1))),
              Container(padding: const EdgeInsets.symmetric(horizontal:4), child: Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:6), decoration: BoxDecoration(color: widget.sessionColorFn(exitSession), borderRadius: BorderRadius.circular(8)), child: Text(widget.formatTimeFn(r['exitTime']), style: const TextStyle()))),
              Container(padding: const EdgeInsets.symmetric(horizontal:4), child: Flexible(child: Text('Exit: ${r['exitPrice'] != null ? widget.formatCurrencyFn(r['exitPrice']) : '-'}', overflow: TextOverflow.ellipsis, maxLines: 1))),
            ])
          ]),
          trailing: SizedBox(
            width: 160,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(unrealized != null ? widget.formatCurrencyFn(unrealized) : '-', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: unrealized != null && unrealized >=0 ? Colors.green[700] : Colors.red[700])),
              const SizedBox(height:6),
              Text(pnl != null ? widget.formatCurrencyFn(pnl) : '-', style: TextStyle(fontSize: 13, color: pnl != null && pnl >=0 ? Colors.green[700] : Colors.red[700], fontWeight: FontWeight.bold)),
              const SizedBox(height:6),
              Column(mainAxisSize: MainAxisSize.min, children: [
                if (status == 'open') SizedBox(width: 80, height: 32, child: ElevatedButton(onPressed: widget.onClose, style: ElevatedButton.styleFrom(textStyle: const TextStyle(fontSize: 13)), child: const Text('Close'))),
                const SizedBox(height:6),
                SizedBox(width: 80, height: 32, child: OutlinedButton(onPressed: widget.onDelete, style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 13)), child: const Text('Delete'))),
              ])
            ]),
          ),
        ),
      ),
    );
  }
}
