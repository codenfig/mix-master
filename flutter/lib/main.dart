import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const MixMasterApp());

class MixMasterApp extends StatelessWidget {
  const MixMasterApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'MixMaster AI',
    theme: ThemeData.dark(useMaterial3: true).copyWith(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff9656f0), brightness: Brightness.dark),
    ),
    home: const MixScreen(),
  );
}

class MixScreen extends StatefulWidget {
  const MixScreen({super.key});
  @override
  State<MixScreen> createState() => _MixScreenState();
}

class _MixScreenState extends State<MixScreen> {
  int count = 10, transition = 12;
  List<PlatformFile> files = [];
  bool busy = false;
  String message = 'Select audio tracks to begin.';
  final endpoint = TextEditingController(text: 'http://127.0.0.1:8000');

  @override
  void dispose() { endpoint.dispose(); super.dispose(); }

  Future<void> choose() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['mp3','wav','flac','m4a','ogg','aac'],
      withData: true,
    );
    if (result != null) setState(() {
      files = result.files;
      message = files.length == count ? 'Ready to analyze.' : 'Select exactly $count tracks.';
    });
  }

  Future<void> analyze() async {
    if (files.length != count || busy) return;
    setState(() { busy = true; message = 'Uploading and analyzing…'; });
    try {
      final uri = Uri.parse('${endpoint.text.replaceAll(RegExp(r"/+$"), "")}/api/analyze');
      final req = http.MultipartRequest('POST', uri)
        ..fields['count'] = '$count';
      for (final f in files) {
        final Uint8List? bytes = f.bytes;
        if (bytes == null) throw StateError('Cannot read ${f.name}');
        req.files.add(http.MultipartFile.fromBytes('songs', bytes, filename: f.name));
      }
      final response = await http.Response.fromStream(await req.send());
      setState(() => message = response.statusCode == 200
          ? 'Analysis completed: ${response.body}'
          : 'Analysis failed (${response.statusCode}): ${response.body}');
    } catch (e) {
      setState(() => message = 'Connection error: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('🎧 MixMaster AI')),
    body: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 700),
      child: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Your AI DJ Studio', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: endpoint, decoration: const InputDecoration(
          labelText: 'Backend URL (HTTPS for mobile deployment)',
          border: OutlineInputBorder(),
        )),
        const SizedBox(height: 16),
        DropdownButtonFormField<int>(
          value: count, decoration: const InputDecoration(labelText: 'Number of songs'),
          items: [5,10,20].map((n) => DropdownMenuItem(value: n, child: Text('$n songs'))).toList(),
          onChanged: busy ? null : (v) => setState(() { count = v!; files = []; }),
        ),
        const SizedBox(height: 12),
        Text('Transition: $transition seconds'),
        Slider(value: transition.toDouble(), min: 4, max: 32, divisions: 28,
          onChanged: busy ? null : (v) => setState(() => transition = v.round())),
        FilledButton.icon(onPressed: busy ? null : choose,
          icon: const Icon(Icons.upload_file), label: const Text('Select songs')),
        Text('${files.length} / $count files selected'),
        FilledButton(onPressed: busy || files.length != count ? null : analyze,
          child: const Text('Analyze tracks')),
        if (busy) const LinearProgressIndicator(),
        const SizedBox(height: 16),
        SelectableText(message),
        const SizedBox(height: 16),
        const Text('Flutter client MVP: analysis only. Mix download and native packaging are not yet implemented.'),
      ]),
    )),
  );
}
