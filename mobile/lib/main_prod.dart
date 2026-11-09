import 'app/config.dart';
import 'main.dart';

/// نكهة الإنتاج — تتحدّث إلى club.masaros.net.
/// التشغيل: flutter run --flavor prod -t lib/main_prod.dart
void main() => bootstrap(AppConfig.prod);
