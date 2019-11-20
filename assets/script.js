// config
var EXPLORER_URL = "https://explorer.horizen.global";
var INSIGHT_API_URL = "https://explorer.zen-solutions.io/api/";


var Helper = {
    createInsightApiUrl: function (path) {
        return INSIGHT_API_URL + path;
    },

    convertAmountToSatoshi: function (amount) {
        if (typeof amount == "string") {
            amount = parseFloat(amount);
        }

        return Math.round(amount * 100000000);
    }
};


var Wallet = {
    pk: null,
    address: null,
    allUtxo: null,
    selectedUtxo: null,

    setPk: function (pk) {
        var self = this;

        // If not 64 length, probs WIF format
        if (pk.length !== 64) {
            pk = zencashjs.address.WIFToPrivKey(pk)
        }

        // Convert private key to compressed public address
        var pubKey = zencashjs.address.privKeyToPubKey(pk, true);

        // Convert public key to ZEN address
        self.address = zencashjs.address.pubKeyToAddr(pubKey);
        self.pk = pk;
    },

    fetchUtxo: function (cb) {
        var self = this;

        $.get(Helper.createInsightApiUrl("addr/" + self.address + "/utxo"), function (data) {
            // remove unconfirmed tx and save  to variable $allUtxo
            self.allUtxo = data.filter(function (tx) {
                return tx.confirmations > 0
            });

            if (cb) cb();
        });
    },

    getSelectedAmount: function () {
        var self = this;

        return self.selectedUtxo.reduce(function (total, tx) {
            return total + tx.amount;
        }, 0.0);
    },

    sendZEN: function (receiverAddress, sendAmountSat, refundAddress, fee, cb) {
        var self = this;

        var bip115BlockHeight = 600000;
        var bip115BlockHash = '0000000010987ddfdfffccd884a71ff8650ec7d523340103529595c9cddcf42c';


        var histories = self.selectedUtxo.map(function (tx) {
            return {txid: tx.txid, vout: tx.vout, scriptPubKey: tx.scriptPubKey};
        });

        var totalAmountSat = self.selectedUtxo.reduce(function (total, tx) {
            return total + tx.satoshis;
        }, 0);

        var refundSat = totalAmountSat - sendAmountSat - fee;

        var recipients = [{address: receiverAddress, satoshis: sendAmountSat}];

        if (refundSat > 0) {
            recipients.push({address: refundAddress, satoshis: refundSat});
        }

        var txObj = zencashjs.transaction.createRawTx(histories, recipients, bip115BlockHeight, bip115BlockHash);

        // Sign each history transaction
        for (var i = 0; i < histories.length; i++) {
            txObj = zencashjs.transaction.signTx(txObj, i, self.pk, true);
        }

        // Convert it to hex string
        var txHexString = zencashjs.transaction.serializeTx(txObj);

        $.post(Helper.createInsightApiUrl("tx/send"), {rawtx: txHexString}, function (data) {
            if (cb) cb(data.txid);
        });
    }
};

$(function () {

    $("#btn-submit-private-key").click(function () {
        var modal = $(this).closest(".modal");

        // close modal
        modal.modal("hide");

        var pk = modal.find(".private-key").val();

        Wallet.setPk(pk);

        Wallet.fetchUtxo(function () {
            Wallet.allUtxo.forEach(function (tx) {
                $("#sender-address-utxo").append($('<option>', {value: tx.txid, text: JSON.stringify(tx)}));
            });
        });

        $("#sender-address").val(Wallet.address);
    });


    $("#sender-address-utxo").change(function () {
        var selectedTxIds = $(this).val();

        Wallet.selectedUtxo = Wallet.allUtxo.filter(function (tx) {
            return selectedTxIds.indexOf(tx.txid) !== -1
        });

        $("#sender-selected-utxo-amount").val(Number(Wallet.getSelectedAmount()).toFixed(8));
    });


    // Review transaction: just get value from inputs and display on the modal
    $("#modal-review-transaction").on('show.bs.modal', function (e) {
        var modal = $(this);

        var receiverAddr = $("#receiver-address").val();
        var receiverAmount = parseFloat($("#receiver-amount").val());
        var refundAddr = $("#receiver-refund-address").val();
        var txFee = parseFloat($("#tx-fee").val());
        var totalAmount = parseFloat($("#sender-selected-utxo-amount").val());

        modal.find(".receiver-addr").html(receiverAddr);
        modal.find(".receiver-amount").html(receiverAmount);
        modal.find(".refund-addr").html(refundAddr);
        modal.find(".refund-amount").html(Number(totalAmount - receiverAmount - txFee).toFixed(8));
        modal.find(".tx-fee").html(txFee);
    });


    $("#btn-send-transaction").click(function () {
        var cb = function (txid) {
            var modal = $("#modal-transaction-result");
            modal.modal("show");
            modal.find(".txid").html('<a href="' + EXPLORER_URL + '/tx/' + txid + '" target="_blank">' + txid + '</a>');
        };
        var fee = Helper.convertAmountToSatoshi($("#tx-fee").val());
        var sendAmountSat = Helper.convertAmountToSatoshi($("#receiver-amount").val());
        var receiverAddress = $("#receiver-address").val();
        var refundAddress = $("#receiver-refund-address").val();

        Wallet.sendZEN(receiverAddress, sendAmountSat, refundAddress, fee, cb);
    });

});
