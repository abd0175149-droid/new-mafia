# يضيف هدف NotificationService (تمديد خدمة إشعارات) لمشروع Runner.
# 🔴 عبر الأداة لا بتحرير نصّيّ: المشروع يحمل 18 تهيئة بناء.
require 'xcodeproj'

path = File.expand_path('~/new-mafia/mobile/ios/Runner.xcodeproj')
proj = Xcodeproj::Project.open(path)

if proj.targets.any? { |t| t.name == 'NotificationService' }
  puts 'ℹ️ الهدف موجودٌ أصلاً'
  exit 0
end

app = proj.targets.find { |t| t.name == 'Runner' }
abort '❌ لا هدف Runner' unless app

ext = proj.new_target(:app_extension, 'NotificationService', :ios, '13.0')

group = proj.main_group.new_group('NotificationService', 'NotificationService')
src = group.new_reference('NotificationService.swift')
ext.source_build_phase.add_file_reference(src)
group.new_reference('Info.plist')

# 🔴 معرّف التمديد **بادئته معرّف التطبيق**: النظام يشترط ذلك، ومعرّفٌ
#    مستقلّ يُرفض عند التثبيت. ويُشتقّ لكلّ نكهةٍ من معرّفها.
ext.build_configurations.each do |c|
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = '$(inherited).notificationservice'
  c.build_settings['INFOPLIST_FILE'] = 'NotificationService/Info.plist'
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
  c.build_settings['SWIFT_VERSION'] = '5.0'
  c.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  c.build_settings['SKIP_INSTALL'] = 'YES'
end

# يُدمج داخل حزمة التطبيق
embed = app.build_phases.find { |p|
  p.respond_to?(:name) && p.name == 'Embed Foundation Extensions'
} || app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
embed.add_file_reference(ext.product_reference)
app.add_dependency(ext)

proj.save
puts '✅ أُضيف هدف NotificationService'
