import contracts from '../../contracts/contracts';

export default class Cdp {
  constructor(cdpService, cdpId = null) {
    this._cdpService = cdpService;
    this._transactionManager = this._cdpService.get('transactionManager');
    this._smartContractService = this._cdpService.get('smartContract');
    if (cdpId === null) {
      this._cdpIdPromise = this._newCdpPromise();
    } else {
      this._cdpIdPromise = Promise.resolve(cdpId);
    }
    this._emitterInstance = this._cdpService
      .get('event')
      .buildEmitter({ group: 'cdp' });
    this.on = this._emitterInstance.on;
    this._emitterInstance.registerPollEvents({
      COLLATERAL: {
        USD: () => this.getCollateralValueInUSD(),
        ETH: () => this.getCollateralValueInEth()
      },
      DEBT: {
        dai: () => this.getDebtValueInDai()
      }
    });
  }

  _captureCdpIdPromise(tubContract) {
    const ethersSigner = this._smartContractService.get('web3').ethersSigner();
    const ethersUtils = this._smartContractService.get('web3').ethersUtils();

    return new Promise(resolve => {
      // Event handlers need to be registered on the inner Ethers.js contract, for now
      tubContract._original.onlognewcup = function(address, cdpIdBytes32) {
        if (ethersSigner.address.toLowerCase() == address.toLowerCase()) {
          const cdpId = ethersUtils.bigNumberify(cdpIdBytes32).toNumber();
          this.removeListener();
          resolve(cdpId);
        }
      };
    });
  }

  _newCdpPromise() {
    const tubContract = this._smartContractService.getContractByName(
      contracts.SAI_TUB
    );
    const captureCdpIdPromise = this._captureCdpIdPromise(tubContract);
    const contractPromise = tubContract.open();
    this._transactionObject = this._transactionManager.createTransactionHybrid(
      contractPromise,
      this
    );

    return Promise.all([captureCdpIdPromise, contractPromise]).then(
      result => result[0]
    );
  }

  transactionObject() {
    return this._transactionObject;
  }

  getCdpId() {
    return this._cdpIdPromise;
  }

  async shut() {
    const id = await this.getCdpId();
    return this._cdpService.shutCdp(id);
  }

  async getInfo() {
    const id = await this.getCdpId();
    return this._cdpService.getCdpInfo(id);
  }

  async getCollateralValueInPeth() {
    const id = await this.getCdpId();
    return this._cdpService.getCdpCollateralInPeth(id);
  }

  getCollateralValueInEth() {
    return this.getCdpId().then(id =>
      this._cdpService.getCdpCollateralInEth(id)
    );
  }

  getCollateralValueInUSD() {
    return this.getCdpId().then(id =>
      this._cdpService.getCdpCollateralInUSD(id)
    );
  }

  getDebtValueInDai() {
    return this.getCdpId().then(id => this._cdpService.getCdpDebtInDai(id));
  }

  getDebtValueInUSD() {
    return this.getCdpId().then(id => this._cdpService.getCdpDebtInUSD(id));
  }

  async getCollateralizationRatio() {
    const id = await this.getCdpId();
    return this._cdpService.getCollateralizationRatio(id);
  }

  async getLiquidationPriceEthUSD() {
    const id = await this.getCdpId();
    return this._cdpService.getLiquidationPriceEthUSD(id);
  }

  async isSafe() {
    const id = await this.getCdpId();
    return this._cdpService.isCdpSafe(id);
  }

  async lockEth(eth) {
    const id = await this.getCdpId();
    return this._cdpService.lockEth(id, eth);
  }

  async lockWeth(weth) {
    const id = await this.getCdpId();
    return this._cdpService.lockWeth(id, weth);
  }

  async lockPeth(eth) {
    const id = await this.getCdpId();
    return this._cdpService.lockPeth(id, eth);
  }

  async drawDai(amount) {
    const id = await this.getCdpId();
    return this._cdpService.drawDai(id, amount);
  }

  async freePeth(amount) {
    const id = await this.getCdpId();
    return this._cdpService.freePeth(id, amount);
  }

  async wipeDai(amount) {
    const id = await this.getCdpId();
    return this._cdpService.wipeDai(id, amount);
  }

  async give(newAddress) {
    const id = await this.getCdpId();
    return this._cdpService.give(id, newAddress);
  }
}
