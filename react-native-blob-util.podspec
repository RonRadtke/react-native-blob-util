require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name             = package['name']
  s.version          = package['version']
  s.summary          = package['description']
  s.requires_arc = true
  s.license      = 'MIT'
  s.homepage     = 'n/a'
  s.source       = { :git => "https://github.com/RonRadtke/react-native-blob-util", :tag => s.version.to_s }
  s.author       = 'RonRadtke'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'

  # Only headers that do not import React may be public: the umbrella this
  # generates is what Swift imports as the underlying module, and a React
  # header inside it is not modular from Swift's point of view.
  s.public_header_files = [
    'ios/ReactNativeBlobUtilConst.h',
    'ios/ReactNativeBlobUtilExceptionCatch.h',
    'ios/ReactNativeBlobUtilFileTransformer.h',
  ]

  s.resource_bundles = {
    'ReactNativeBlobUtilPrivacyInfo' => ['ios/PrivacyInfo.xcprivacy'],
  }

  # min_ios_version_supported is defined by React Native's Podfile helper, so it
  # only exists when the spec is evaluated through an app's Podfile. Evaluating
  # it any other way - `pod ipc spec`, `pod spec lint` - would raise NoMethodError
  # and take the published podspec with it, hence the literal fallback.
  s.platforms    = { :ios => defined?(min_ios_version_supported) ? min_ios_version_supported : "15.1" }
  s.swift_version = '5.0'
  s.framework    = 'Photos'

  # install_modules_dependencies is a React Native Podfile helper, so like
  # min_ios_version_supported above it only exists when an app's Podfile has
  # required react_native_pods.rb. Calling it unguarded makes the published
  # podspec unparseable outside that context. The guard is about evaluation
  # context only - there is no longer an old-architecture branch here.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end

  # Merge rather than assign: install_modules_dependencies sets this too, and
  # replacing it drops the header and flag configuration it just wrote.
  s.pod_target_xcconfig = (s.attributes_hash['pod_target_xcconfig'] || {}).merge({
    'DEFINES_MODULE' => 'YES',
  })
end
