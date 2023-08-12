// This module enables requests interception in React Native
// using the same request handlers as in tests.
import { setupServer } from 'msw/native'

import { handlers } from './handlers'

export const native = setupServer( ...handlers )