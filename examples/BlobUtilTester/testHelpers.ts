export type TestResult = {
  isSuccess: boolean;
  message?: string;
};

export type TestFunction = () => Promise<TestResult>;

export function assertEquals<T>(expected: T, actual: T): TestResult {
  const isSuccess = expected === actual;

  return {
    isSuccess,
    message: isSuccess
      ? undefined
      : `Expected "${expected}", but got "${actual}"`,
  };
}

export function failWithError(error: any): TestResult {
  console.log(error);
  return {isSuccess: false, message: error?.message || ''};
}

export function getTestResultIndicator(result: TestResult): string {
  if (!result) {
    return '❔';
  }

  return result.isSuccess ? '✅' : '❌';
}
