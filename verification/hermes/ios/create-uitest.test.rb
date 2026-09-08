require "tmpdir"
require "rbconfig"
require "json"
require "open3"
require "xcodeproj"

# Project-generation preflight only: never boots or installs on a device.
Dir.mktmpdir("daykeeper-uitest-project-") do |directory|
  project_path = File.join(directory, "DaykeeperHermesSmoke.xcodeproj")
  project = Xcodeproj::Project.new(project_path)
  app = project.new_target(:application, "DaykeeperHermesSmoke", :ios, "15.1")
  app.build_configurations.each do |configuration|
    configuration.build_settings["PRODUCT_NAME"] = "$(TARGET_NAME)"
  end
  project.save
  source = File.join(directory, "Smoke.swift")
  File.write(source, "import XCTest\n")
  generator = File.join(__dir__, "create-uitest.rb")
  raise "generator failed" unless system(RbConfig.ruby, generator, project_path, source)
  output, status = Open3.capture2e("xcodebuild", "-project", project_path,
    "-target", "DaykeeperHermesSmokeUITests", "-configuration", "Release",
    "-sdk", "iphonesimulator", "-showBuildSettings", "-json")
  raise output unless status.success?
  settings = JSON.parse(output).find { |target| target["target"] == "DaykeeperHermesSmokeUITests" }.fetch("buildSettings")
  expected = {
    "PRODUCT_NAME" => "DaykeeperHermesSmokeUITests",
    "FULL_PRODUCT_NAME" => "DaykeeperHermesSmokeUITests.xctest",
    "PRODUCT_BUNDLE_IDENTIFIER" => "com.daykeeperhermessmoke.uitests",
    "TEST_TARGET_NAME" => "DaykeeperHermesSmoke"
  }
  expected.each do |key, value|
    raise "unexpected #{key}: #{settings[key].inspect}" unless settings[key] == value
  end
  puts "Generated XCUITest product settings verified"
end
