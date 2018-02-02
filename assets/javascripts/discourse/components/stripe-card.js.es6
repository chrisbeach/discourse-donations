import { ajax } from 'discourse/lib/ajax';
import { getRegister } from 'discourse-common/lib/get-owner';
import { default as computed } from 'ember-addons/ember-computed-decorators';

export default Ember.Component.extend({
  result: [],
  amount: 1,
  stripe: null,
  transactionInProgress: null,
  settings: null,
  showTransactionFeeDescription: false,
  showCustomAmount: Ember.computed.equal('amount', 'custom'),

  init() {
    this._super();
    this.set('anon', (!Discourse.User.current()));
    this.set('settings', getRegister(this).lookup('site-settings:main'));
    this.set('create_accounts', this.get('anon') && this.get('settings').discourse_donations_enable_create_accounts);
    this.set('stripe', Stripe(this.get('settings').discourse_donations_public_key));
  },

  @computed
  donateAmounts() {
    const setting = Discourse.SiteSettings.discourse_donations_amounts.split('|');
    if (setting.length) {
      let amounts = setting.map((amount) => {
        return {
          value: parseInt(amount, 10),
          name: `${amount}.00`
        };
      });

      if (Discourse.SiteSettings.discourse_donations_custom_amount) {
        amounts.push({
          value: 'custom',
          name: I18n.t('discourse_donations.custom_amount')
        });
      }

      return amounts;
    } else {
      return [];
    }
  },

  @computed('stripe')
  card(stripe) {
    let elements = stripe.elements();
    return elements.create('card', {
      hidePostalCode: !this.get('settings').discourse_donations_zip_code
    });
  },

  @computed('amount', 'showCustomAmount', 'customAmount')
  transactionFee(amount, showCustom, custom) {
    const fixed = Discourse.SiteSettings.discourse_donations_transaction_fee_fixed;
    const percent = Discourse.SiteSettings.discourse_donations_transaction_fee_percent;
    const amt = showCustom ? custom : amount;
    const fee = ((amt + fixed)  /  (1 - percent)) - amt;
    return Math.round(fee * 100) / 100;
  },

  @computed('customAmountInput')
  customAmount(input) {
    if (!input) return 0;
    return parseInt(input, 10);
  },

  @computed('amount', 'transactionFee', 'includeTransactionFee', 'showCustomAmount', 'customAmount')
  totalAmount(amount, fee, include, showCustom, custom) {
    let amt = showCustom ? custom : amount;
    if (include) return amt + fee;
    return amt;
  },

  didInsertElement() {
    this._super();
    this.get('card').mount('#card-element');
  },

  setSuccess() {
    this.set('paymentSuccess', true);
  },

  endTranscation() {
    this.set('transactionInProgress', false);
  },

  concatMessages(messages) {
    this.set('result', this.get('result').concat(messages));
  },

  actions: {
    toggleTransactionFeeDescription() {
      this.toggleProperty('showTransactionFeeDescription');
    },

    submitStripeCard() {
      let self = this;
      self.set('transactionInProgress', true);
      this.get('stripe').createToken(this.get('card')).then(data => {
        self.set('result', []);

        if (data.error) {
          self.set('result', data.error.message);
          self.endTranscation();
        } else {
          let amount;
          if (Discourse.SiteSettings.discourse_donations_enable_transaction_fee) {
            amount = this.get('totalAmount');
          } else {
            const showCustomAmount = this.get('showCustomAmount');
            amount = showCustomAmount ? this.get('customAmount') : this.get('amount');
          }

          let params = {
            stripeToken: data.token.id,
            amount: amount * 100,
            email: self.get('email'),
            username: self.get('username'),
            create_account: self.get('create_accounts')
          };

          if(!self.get('paymentSuccess')) {
            ajax('/charges', { data: params, method: 'post' }).then(d => {
              self.concatMessages(d.messages);
              self.endTranscation();
            });
          }
        }
      });
    }
  }
});
