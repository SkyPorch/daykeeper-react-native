require "xcodeproj"

project_path = ARGV.fetch(0)
source_path = ARGV.fetch(1)
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == "DaykeeperHermesSmoke" }
raise "app target missing" unless app_target
app_target.build_configurations.each do |configuration|
  configuration.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = "com.daykeeperhermessmoke"
end

target_name = "DaykeeperHermesSmokeUITests"
target = project.targets.find { |candidate| candidate.name == target_name }
target ||= project.new_target(:ui_test_bundle, target_name, :ios, "15.1")
target.add_dependency(app_target) unless target.dependencies.any? { |dependency| dependency.target == app_target }
file = project.main_group.new_file(source_path)
target.add_file_references([file]) unless target.source_build_phase.files_references.include?(file)
target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings["PRODUCT_BUNDLE_IDENTIFIER"] = "com.daykeeperhermessmoke.uitests"
  settings["GENERATE_INFOPLIST_FILE"] = "YES"
  settings["SWIFT_VERSION"] = "5.0"
  settings["TARGETED_DEVICE_FAMILY"] = "1"
  settings["TEST_TARGET_NAME"] = app_target.name
end
project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app_target)
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.save_as(project_path, target_name, true)
