import 'app/config.dart';
import 'main.dart';

/// نكهة التطوير — تتحدّث إلى staging.
/// التشغيل: flutter run --flavor dev -t lib/main_dev.dart
void main() => bootstrap(AppConfig.dev);
