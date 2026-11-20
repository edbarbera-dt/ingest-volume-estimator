// react-router v7 uses TextEncoder/TextDecoder at import time; jsdom in Jest 29 lacks them.
import { TextDecoder, TextEncoder } from "util";

Object.assign(globalThis, { TextEncoder, TextDecoder });
