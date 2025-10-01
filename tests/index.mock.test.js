const https = require('https');
const { EventEmitter } = require('events');

// Mock WebSocket before requiring the module
class MockWebSocket extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = MockWebSocket.CONNECTING;
    this.messages = [];

    // Simulate async connection
    setImmediate(() => {
      if (!this._shouldFail) {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      } else {
        this.emit('error', new Error('Connection failed'));
      }
    });
  }

  send(data) {
    this.messages.push(data);
  }

  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  removeAllListeners() {
    super.removeAllListeners();
  }

  static setFailNextConnection(fail) {
    MockWebSocket.prototype._shouldFail = fail;
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

// Mock the ws module
jest.mock('ws', () => MockWebSocket);

// Now require after mocking
const WebSocket = require('ws');

// Import MCPNestClient from the source
const MCPNestClient = require('../src/index');
describe('MCPNestClient - WebSocket Connection', () => {
  let client;
  let mockHttpsGet;

  beforeEach(() => {
    client = new MCPNestClient('test-cookie');
    MockWebSocket.setFailNextConnection(false);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  afterEach(() => {
    if (client) {
      client.close();
    }
    if (mockHttpsGet) {
      mockHttpsGet.mockRestore();
    }
  });

  describe('fetchPageTokens', () => {
    test('should fetch and parse tokens from HTML page', async () => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf-token"/>
        <div data-phx-session="test-session" data-phx-static="test-static" id="phx-12345"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });

      await client.fetchPageTokens();

      expect(client.csrfToken).toBe('test-csrf-token');
      expect(client.session).toBe('test-session');
      expect(client.static).toBe('test-static');
      expect(client.phxId).toBe('phx-12345');
    });

    test('should handle redirect response', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 302;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', '');
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });

      await client.fetchPageTokens();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Redirect detected - authentication may have expired');
      consoleErrorSpy.mockRestore();
    });

    test('should handle HTTP errors', async () => {
      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation(() => {
        const mockRequest = new EventEmitter();
        setImmediate(() => {
          mockRequest.emit('error', new Error('Network error'));
        });
        return mockRequest;
      });

      await expect(client.fetchPageTokens()).rejects.toThrow('Network error');
    });

    test('should handle missing tokens in response', async () => {
      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', '<html><body>No tokens here</body></html>');
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });

      await client.fetchPageTokens();

      expect(client.csrfToken).toBeNull();
      expect(client.session).toBeNull();
      expect(client.phxId).toBeNull();
    });
  });

  describe('connect', () => {
    beforeEach(() => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf"/>
        <div data-phx-session="sess" data-phx-static="static" id="phx-123"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });
    });

    test('should establish WebSocket connection successfully', async () => {
      await client.connect();

      expect(client.ws).toBeDefined();
      expect(client.ws.readyState).toBe(WebSocket.OPEN);
      expect(client.heartbeatInterval).toBeDefined();
    });

    test('should fetch tokens before connecting if not present', async () => {
      expect(client.csrfToken).toBeNull();

      await client.connect();

      expect(client.csrfToken).toBe('test-csrf');
      expect(client.ws).toBeDefined();
    });

    test('should handle connection errors', async () => {
      MockWebSocket.setFailNextConnection(true);

      await expect(client.connect()).rejects.toThrow('Connection failed');
    });

    test('should clear heartbeat on close', async () => {
      await client.connect();

      const intervalId = client.heartbeatInterval;
      expect(intervalId).toBeDefined();

      client.ws.emit('close');

      expect(client.heartbeatInterval).toBeNull();
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(() => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf"/>
        <div id="phx-123"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });
    });

    test('should start heartbeat interval on connection', async () => {
      await client.connect();

      // Verify heartbeat interval is set
      expect(client.heartbeatInterval).toBeDefined();
      expect(typeof client.heartbeatInterval).toBe('object');

      client.close();
    });

    test('should send heartbeat messages in correct format', async () => {
      await client.connect();

      // Manually trigger a heartbeat (instead of waiting 30s)
      client.sendMessage([null, String(client.msgRef++), 'phoenix', 'heartbeat', {}]);

      const lastMessage = JSON.parse(client.ws.messages[client.ws.messages.length - 1]);

      expect(Array.isArray(lastMessage)).toBe(true);
      expect(lastMessage[0]).toBeNull();
      expect(typeof lastMessage[1]).toBe('string');
      expect(lastMessage[2]).toBe('phoenix');
      expect(lastMessage[3]).toBe('heartbeat');
      expect(lastMessage[4]).toEqual({});

      client.close();
    });
  });

  describe('joinLiveView', () => {
    beforeEach(() => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf"/>
        <div data-phx-session="sess" data-phx-static="static" id="phx-123"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });
    });

    test('should join LiveView channel successfully', async () => {
      await client.connect();

      const joinPromise = client.joinLiveView();

      const responseData = {
        rendered: { "0": {} },
        status: "ok"
      };

      const replyMsg = [
        client.joinRef,
        "1",
        `lv:${client.phxId}`,
        "phx_reply",
        {
          status: "ok",
          response: responseData
        }
      ];

      setImmediate(() => {
        client.ws.emit('message', Buffer.from(JSON.stringify(replyMsg)));
      });

      const response = await joinPromise;
      expect(response).toEqual(responseData);
    });

    test('should handle join errors', async () => {
      await client.connect();

      const joinPromise = client.joinLiveView();

      const errorMsg = [
        client.joinRef,
        "1",
        `lv:${client.phxId}`,
        "phx_reply",
        {
          status: "error",
          response: { reason: "unauthorized" }
        }
      ];

      setImmediate(() => {
        client.ws.emit('message', Buffer.from(JSON.stringify(errorMsg)));
      });

      await expect(joinPromise).rejects.toThrow('Join failed');
    });

    test('should timeout if no response received', async () => {
      await client.connect();

      // Switch to fake timers after connection
      jest.useFakeTimers();

      const joinPromise = client.joinLiveView();

      // Advance time to trigger timeout
      jest.advanceTimersByTime(10000);

      await expect(joinPromise).rejects.toThrow('Join timeout');

      jest.useRealTimers();
      client.close();
    });

    test('should reject if PHX ID is missing', async () => {
      client.csrfToken = 'test-csrf';
      await client.connect();

      client.phxId = null;

      await expect(client.joinLiveView()).rejects.toThrow('Failed to extract PHX ID from page');
    });

    test('should send correct join message format', async () => {
      await client.connect();

      client.joinLiveView().catch(() => {});

      const joinMessage = JSON.parse(client.ws.messages[0]);

      expect(joinMessage[3]).toBe('phx_join');
      expect(joinMessage[4]).toHaveProperty('url');
      expect(joinMessage[4]).toHaveProperty('params');
      expect(joinMessage[4].params).toHaveProperty('_csrf_token');
      expect(joinMessage[4].params._csrf_token).toBe('test-csrf');
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf"/>
        <div id="phx-123"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });
    });

    test('should send message when WebSocket is open', async () => {
      await client.connect();

      const testMessage = [null, "1", "test-topic", "test-event", {}];
      client.sendMessage(testMessage);

      expect(client.ws.messages).toContain(JSON.stringify(testMessage));
    });

    test('should not send message when WebSocket is closed', async () => {
      await client.connect();

      client.ws.readyState = WebSocket.CLOSED;

      const testMessage = [null, "1", "test-topic", "test-event", {}];
      const messageCount = client.ws.messages.length;

      client.sendMessage(testMessage);

      expect(client.ws.messages.length).toBe(messageCount);
    });
  });

  describe('close', () => {
    beforeEach(() => {
      const mockHtmlData = `
        <meta name="csrf-token" content="test-csrf"/>
        <div id="phx-123"></div>
      `;

      mockHttpsGet = jest.spyOn(https, 'get').mockImplementation((options, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;

        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('data', mockHtmlData);
          mockResponse.emit('end');
        });

        return new EventEmitter();
      });
    });

    test('should clean up resources', async () => {
      await client.connect();

      expect(client.ws).toBeDefined();
      expect(client.heartbeatInterval).toBeDefined();

      client.close();

      expect(client.ws).toBeNull();
      expect(client.heartbeatInterval).toBeNull();
    });

    test('should handle close when already closed', () => {
      expect(() => client.close()).not.toThrow();
    });
  });
});
