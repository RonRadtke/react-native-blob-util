/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {populate} from './testData';
import {getTestResultIndicator, TestFunction, TestResult} from './testHelpers';
import {
  testReadFileShortUtf8DefaultBufferSize,
  testReadFileShortUtf8SmallBufferSize,
} from './tests/fs/readFile';
import {
  readStreamShouldReadUtf8FileCorrectlyWithDefaultBufferSize,
  readStreamShouldReadUtf8FileCorrectlyWithSmallBufferSize,
  copiedFileShouldEqualOriginalFile,
} from './tests/fs/readStream';

const tests: TestFunction[] = [
  testReadFileShortUtf8DefaultBufferSize,
  testReadFileShortUtf8SmallBufferSize,
  readStreamShouldReadUtf8FileCorrectlyWithDefaultBufferSize,
  readStreamShouldReadUtf8FileCorrectlyWithSmallBufferSize,
  copiedFileShouldEqualOriginalFile,
];

const App = () => {
  useEffect(() => {
    populate();
  }, []);

  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {},
  );

  const runTests = async () => {
    for (let testFunc of tests) {
      const res = await testFunc();
      setTestResults(prev => ({
        ...prev,
        [testFunc.name]: res,
      }));
    }
  };

  return (
    <SafeAreaView>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{padding: 20}}>
        <>
          <Text style={styles.title}>React Native Blob Util Tests</Text>
          {tests.map(test => (
            <View key={test.name}>
              <View style={styles.item}>
                <Text style={{maxWidth: '90%'}}>{test.name}</Text>
                <Text>{getTestResultIndicator(testResults[test.name])}</Text>
              </View>
              {testResults[test.name]?.message ? (
                <Text style={styles.errorMessage}>
                  {testResults[test.name].message}
                </Text>
              ) : null}
            </View>
          ))}
          <View>
            <Button title="Run tests" onPress={runTests} />
          </View>
        </>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  item: {
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexDirection: 'row',
  },
  errorMessage: {
    fontSize: 10,
    paddingLeft: 10,
  },
});

export default App;
