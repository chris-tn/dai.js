import PrivateService from '../core/PrivateService';
import { indexerFactory, slug } from './index';
import isEqual from 'lodash.isequal';
import EventEmitterObj from 'eventemitter2';

const { EventEmitter2 } = EventEmitterObj;

export default class EventService extends PrivateService {
  /**
   * @param {string} name
   */
  constructor(name = 'event') {
    super(name, ['log']);

    this._block = null;

    // all of our emitters – we can have many of these
    // e.g. one for our maker object, a couple for some cdp objects, a few more on transaction objects, etc
    this.emitters = {};

    // this is our default emitter, it will likely be the maker object's personal emitter
    this.buildEmitter({ defaultEmitter: true });
    this.ping = this.ping.bind(this);
  }

  // check all of our active polls for new state
  // this is currently called on every new block from Web3Service
  ping(block) {
    this._setBlock(block);
    Object.values(this.emitters).forEach(emitter => this._pingEmitter(emitter));
  }

  // add a event listener to an emitter
  on(event, listener, emitter = this._defaultEmitter()) {
    emitter.on(event, listener);
  }

  // push an event through an emitter
  emit(event, payload, block, emitter = this._defaultEmitter()) {
    emitter.emit(event, payload, block);
  }

  // remove a listener from an emitter
  removeListener(event, listener, emitter = this._defaultEmitter()) {
    emitter.removeListener(event, listener);
  }

  registerPollEvents(eventPayloadMap, emitter = this._defaultEmitter()) {
    return emitter.registerPollEvents(eventPayloadMap);
  }

  _pingEmitter(emitter) {
    emitter._getPolls().forEach(poll => poll.ping());
  }

  _disposeEmitter(id) {
    if (id === 'default') {
      this._logError(id, 'cannot dispose default emitter');
    } else delete this.emitters[id];
  }

  _startAllPolls() {
    Object.values(this.emitters).forEach(emitter => emitter._startPolls());
  }

  _defaultEmitter() {
    return this.emitters.default;
  }

  _setBlock(block) {
    if (block !== undefined) this._block = block;
  }

  _getBlock() {
    return this._block;
  }

  _logError(name, msg) {
    this.get('log').error(`Problem encountered in emitter ${name}: ${msg}`);
  }

  // emitter factory
  buildEmitter({
    _emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '/'
    }),
    _slug = slug(),
    indexer = indexerFactory(),
    defaultEmitter = false
  } = {}) {
    const id = defaultEmitter ? 'default' : _slug;
    const disposer = this._disposeEmitter.bind(this, id);
    const _getBlock = this._getBlock.bind(this);
    const newEmitter = this._buildEmitter({
      _emitter,
      _getBlock,
      indexer,
      disposer
    });
    newEmitter.on('error', eventObj => this._logError(id, eventObj.payload));
    this.emitters[id] = newEmitter;
    return newEmitter;
  }

  _buildEmitter({ _emitter, _getBlock, indexer, disposer, polls = [] }) {
    return {
      emit(event, payload = {}, block = _getBlock()) {
        // if nobody's listening for this event, don't actually emit it
        if (_emitter.listeners(event).length === 0) return;
        const eventObj = {
          payload,
          block,
          type: event,
          index: indexer()
        };
        _emitter.emit(event, eventObj);
      },
      on(event, listener) {
        _emitter.on(event, listener);
        // start polling for state changes if the associated event now has a listener
        polls.forEach(
          poll => _emitter.listeners(poll.type()).length > 0 && poll.heat()
        );
      },
      removeListener(event, listener) {
        _emitter.removeListener(event, listener);
        // stop polling for state changes if the associated event no longer has a listener
        polls.forEach(
          poll => _emitter.listeners(poll.type()).length === 0 && poll.cool()
        );
      },
      registerPollEvents(eventPayloadMap) {
        for (const [eventType, payloadGetterMap] of Object.entries(
          eventPayloadMap
        )) {
          const payloadFetcher = EventService._createPayloadFetcher(
            payloadGetterMap
          );
          const memoizedPoll = EventService._createMemoizedPoll({
            type: eventType,
            emit: this.emit,
            getState: payloadFetcher
          });
          polls.push(memoizedPoll);
        }
        return this;
      },
      dispose() {
        this.emit = () => {};
        this.on = () => {};
        disposer();
      },
      _startPolls() {
        polls.forEach(poll => poll.heat());
      },
      _stopPolls() {
        polls.forEach(poll => poll.cool());
      },
      _getPolls() {
        return polls;
      }
    };
  }

  //////////////////////////////
  /////  Polling Helpers  //////
  //////////////////////////////

  static _createPayloadFetcher(payloadSchema) {
    return () => {
      return Promise.all(
        Object.entries(payloadSchema).map(([key, getter]) =>
          getter().then(state => [key, state])
        )
      ).then(states => {
        const payload = {};
        for (const [key, state] of states) {
          payload[key] = state;
        }
        return payload;
      });
    };
  }

  static _createMemoizedPoll({
    type,
    getState,
    emit,
    curr = {},
    live = false
  }) {
    return {
      async ping() {
        if (!live) return;
        try {
          const next = await getState();
          if (!isEqual(curr, next)) {
            emit(type, next);
            curr = next;
          }
        } catch (err) {
          const msg = `Failed to get latest ${type} state. Message: ${err}`;
          emit('error', msg);
        }
      },
      async heat() {
        try {
          curr = await getState();
          if (!live) live = true;
        } catch (err) {
          const msg = `Failed to get initial ${type} state. Message: ${err}`;
          emit('error', msg);
        }
      },
      cool() {
        if (live) live = false;
      },
      type() {
        return type;
      },
      live() {
        return live;
      }
    };
  }
}