import ReactNativeBlobUtil, {Encoding} from 'react-native-blob-util';

export type FileDescription = {
  PATH: string;
  CONTENT: string | number[];
  ENCODING: Encoding;
};

const SIMPLE_UTF: FileDescription = {
  PATH: ReactNativeBlobUtil.fs.dirs.DocumentDir + '/short-utf8.txt',
  CONTENT: 'abc 👨🏾‍🚀 æøå',
  ENCODING: 'utf8',
};

const FILE_A: FileDescription = {
  PATH: ReactNativeBlobUtil.fs.dirs.DocumentDir + '/file-a.txt',
  CONTENT: '012345678998765',
  ENCODING: 'utf8',
};

export const FILES = {
  SIMPLE_UTF,
  FILE_A,
};

export async function populate() {
  for (const file of Object.values(FILES)) {
    const {PATH, CONTENT, ENCODING} = file;
    await ReactNativeBlobUtil.fs.writeFile(PATH, CONTENT, ENCODING);
  }
}
