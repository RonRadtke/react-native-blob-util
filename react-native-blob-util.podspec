require "json"

fabric_enabled = ENV['RCT_NEW_ARCH_ENABLED'] == '1'
package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name             = package['name']
  s.version          = package['version']
  s.summary          = package['description']
  s.requires_arc = true
  s.license      = 'MIT'
  s.homepage     = 'n/a'
  s.source       = { :git => "https://github.com/RonRadtke/react-native-blob-util", :tag => "v#{s.version.to_s}" }
  s.author       = 'RonRadtke'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.resource_bundles = {
    'ReactNativeBlobUtilPrivacyInfo' => ['ios/PrivacyInfo.xcprivacy'],
  }
  s.platforms       = { :ios => "11.0" }
  s.framework    = 'Photos'

  if fabric_enabled
    # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
    # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
    if respond_to?(:install_modules_dependencies, true)
      install_modules_dependencies(s)
    else
      # just for backward compatibility: if React Native version <= 0.70.x
      s.compiler_flags = "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32 -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig    = {
        "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
        "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
        "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }

      s.dependency 'React-Core'
      s.dependency "React-Codegen"
      s.dependency "React-RCTFabric"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  else
    s.dependency 'React-Core'
  end

end
