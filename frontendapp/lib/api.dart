import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

const String baseUrl = 'http://localhost:5007';

class Api {
  static Future<List<String>> fetchTables() async {
    try {
      final r = await http.get(Uri.parse('$baseUrl/tables')).timeout(const Duration(seconds: 8));
      if (r.statusCode == 200) {
        final j = jsonDecode(r.body);
        return List<String>.from(j['tables'] ?? []);
      }
      throw Exception('Failed to load tables: ${r.statusCode} ${r.body}');
    } catch (e) {
      throw Exception('Failed to load tables: $e');
    }
  }

  static Future<List<dynamic>> fetchTrades({String? tableName, String? coinName, String? status}) async {
    final uri = Uri.parse('$baseUrl/gettrades').replace(queryParameters: {
      if (tableName != null && tableName.isNotEmpty) 'tableName': tableName,
      if (coinName != null && coinName.isNotEmpty) 'coinName': coinName,
      if (status != null && status.isNotEmpty) 'status': status,
    });

    try {
      final r = await http.get(uri).timeout(const Duration(seconds: 10));
      if (r.statusCode == 200) {
        final j = jsonDecode(r.body);
        return List<dynamic>.from(j['trades'] ?? []);
      }
      throw Exception('Failed to load trades: ${r.statusCode} ${r.body}');
    } catch (e) {
      throw Exception('Failed to load trades: $e');
    }
  }

  static Future<double> fetchPriceBinance(String coin) async {
    final uri = Uri.parse('$baseUrl/getprice-binance').replace(queryParameters: {'coinname': coin});
    try {
      final r = await http.get(uri).timeout(const Duration(seconds: 8));
      if (r.statusCode == 200) {
        final j = jsonDecode(r.body);
        if (j['price'] is num) return (j['price'] as num).toDouble();
        throw Exception('Invalid price payload: ${r.body}');
      }
      throw Exception('Price fetch failed: ${r.statusCode} ${r.body}');
    } catch (e) {
      throw Exception('Price fetch failed: $e');
    }
  }

  static Future<dynamic> postManage(String coin, Map<String, dynamic> payload, {String? tableName}) async {
    final uri = Uri.parse('$baseUrl/manage/$coin' + (tableName != null && tableName.isNotEmpty ? '?tableName=$tableName' : ''));
    try {
      final r = await http.post(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(payload)).timeout(const Duration(seconds: 15));
      if (r.statusCode == 200) return jsonDecode(r.body);
      throw Exception('Manage action failed: ${r.statusCode} ${r.body}');
    } catch (e) {
      throw Exception('Manage action failed: $e');
    }
  }

  static Future<dynamic> fetchBest(String? tableName) async {
    final uri = Uri.parse('$baseUrl/getbest').replace(queryParameters: {if (tableName != null && tableName.isNotEmpty) 'table': tableName});
    final r = await http.get(uri).timeout(const Duration(seconds: 10));
    if (r.statusCode == 200) return jsonDecode(r.body);
    throw Exception('getbest failed');
  }
}
